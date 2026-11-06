/** Shared with math-tutoring. UTC grains retain their original IDs. No private data in permits/claims. */
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where, type Transaction } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { AvailabilityException, Booking, SchedulingSettings } from '@/types';
import { DEFAULT_SCHEDULING } from '@/services/defaults';
import { deepMerge } from '@/utils/merge';
import { grainsFor, grainDocId, resolvePeriodsForDate, normalizeWeekly } from '@/utils/slots';
import { addDays, daysBetween, getWallClock, makeDateKey, minutesOfDayIn, timeZoneOffsetMs, toDateKey, todayDateKey, wallTimeExists, zonedTimeToUtc } from '@/utils/time';

export const EMPTY_DAY = '0'.repeat(288);
export const GRAIN_MS = 300_000;
export const dayId = (day: number) => `d${day}`;
export const utcDay = (grain: number) => Math.floor(grain / 288);
export function offlineGuard() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Reconnect before saving. Calendar changes are never queued offline.');
}
export function groupedGrains(grains: number[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  grains.forEach(g => groups.set(utcDay(g), [...(groups.get(utcDay(g)) ?? []), g % 288]));
  return groups;
}
export function setBits(bitmap: string, indexes: number[], value: '0' | '1') {
  const bits = bitmap.split(''); indexes.forEach(i => { bits[i] = value; }); return bits.join('');
}
export function intervalGrains(start: Date, duration: number, before = 0, after = 0) {
  if (!Number.isInteger(duration) || duration < 5 || duration > 480 || !Number.isFinite(start.getTime()) || !Number.isInteger(before) || !Number.isInteger(after) || before < 0 || after < 0 || before > 120 || after > 120) throw new Error('Use a 5–480 minute lesson and buffers up to 120 minutes.');
  return grainsFor(new Date(start.getTime() - before * 60000), new Date(start.getTime() + duration * 60000), after);
}
export function effectiveSettings(data: Record<string, unknown> = {}) {
  return deepMerge(DEFAULT_SCHEDULING, data) as SchedulingSettings & { revision?: string; enforcementVersion?: number };
}
export interface PermitDay {day:number;bitmap:string;offsetAtStart:number;transitions:{atMs:number;offsetMs:number}[]}
export function permitDocuments(settings: SchedulingSettings, exceptions: AvailabilityException[], now = new Date()) {
  const days = new Map<number, PermitDay>();
  const today = todayDateKey(settings.timezone, now);
  const windows=new Map<string,ReturnType<typeof resolvePeriodsForDate>>();
  for (let n = -1; n <= Math.min(400, settings.maximumAdvanceDays) + 1; n++) {
    const key = addDays(today, n);
    windows.set(key,resolvePeriodsForDate(key,settings,exceptions));
  }
  // Inspect actual UTC grains in local wall time. Converting nonexistent DST endpoints
  // directly can move 02:30 backwards to 01:30 and accidentally open an earlier hour.
  const first=utcDay(Math.floor(zonedTimeToUtc(addDays(today,-2),0,settings.timezone).getTime()/GRAIN_MS));
  const last=utcDay(Math.ceil(zonedTimeToUtc(addDays(today,Math.min(400,settings.maximumAdvanceDays)+3),0,settings.timezone).getTime()/GRAIN_MS));
  for(let day=first;day<=last;day++){
    const midnight=day*86400000,offsetAtStart=timeZoneOffsetMs(new Date(midnight),settings.timezone);
    const entry:PermitDay={day,bitmap:EMPTY_DAY,offsetAtStart,transitions:[]};
    let previousOffset=offsetAtStart;
    for(let index=0;index<=288;index++){
      const instant=midnight+index*GRAIN_MS,wall=getWallClock(new Date(instant),settings.timezone);
      const offset=Date.UTC(wall.year,wall.month-1,wall.day,wall.hour,wall.minute,wall.second)-instant;
      if(index>0&&offset!==previousOffset){
        let observed=previousOffset;
        for(let at=instant-GRAIN_MS+1000;at<=instant&&at<midnight+86400000;at+=1000){
          const next=timeZoneOffsetMs(new Date(at),settings.timezone);
          if(next!==observed){entry.transitions.push({atMs:at,offsetMs:next});observed=next;if(at%GRAIN_MS)entry.bitmap=setBits(entry.bitmap,[index-1],'0');}
        }
      }
      previousOffset=offset;
      if(index===288)continue;
      const periods=windows.get(makeDateKey(wall.year,wall.month,wall.day)),minute=wall.hour*60+wall.minute;
      if(periods?.some(p=>minute>=p.start&&minute+5<=p.end))entry.bitmap=setBits(entry.bitmap,[index],'1');
    }
    if(entry.transitions.length>4)throw new Error('This timezone has more clock transitions than the published-day format supports.');
    days.set(day,entry);
  }
  return days;
}
export function permitMap(settings:SchedulingSettings,exceptions:AvailabilityException[],now=new Date()){
  return new Map([...permitDocuments(settings,exceptions,now)].map(([day,data])=>[day,data.bitmap]));
}

export interface SharedLesson {
  id?: string; start: Date; duration: number; before?: number; after?: number;
  parentName: string; studentName: string; phone: string; email: string; subject: string;
  notes?: string; internalNotes?:string; expectedUpdatedAt?:number; status?: string; confirmationCode?:string; meta?: Record<string, unknown>;
}

/** One atomic transaction for a lesson or finite recurring series. Fail all occurrences on any conflict. */
export async function saveLessons(lessons: SharedLesson[], options: { public?: boolean; overrideAvailability?: boolean;expectedTimezone?:string } = {}) {
  offlineGuard();
  if (!lessons.length || lessons.length > 24) throw new Error('A series must contain 1–24 occurrences.');
  let ownerPolicy:{revision:string;exceptions:AvailabilityException[]}|undefined;
  if(!options.public&&!options.overrideAvailability){
    const snapshot=await getDocFromServer(doc(db(),'settings','scheduling')),scheduling=effectiveSettings(snapshot.data());
    const dates=lessons.flatMap(l=>[toDateKey(l.start,scheduling.timezone),toDateKey(new Date(l.start.getTime()+l.duration*60000),scheduling.timezone)]).sort();
    const exceptions=await getDocsFromServer(query(collection(db(),'exceptions'),where('date','>=',addDays(dates[0]!,-1)),where('date','<=',addDays(dates[dates.length-1]!,1))));
    ownerPolicy={revision:scheduling.revision??'',exceptions:exceptions.docs.map(d=>({id:d.id,...d.data()} as AvailabilityException))};
  }
  const refs = lessons.map(l => l.id ? doc(db(), 'bookings', l.id) : doc(collection(db(), 'bookings')));
  await runTransaction(db(), async tx => {
    const scheduleSnap = await tx.get(doc(db(), 'settings', 'scheduling'));
    if(!options.public){const migration=await tx.get(doc(db(),'migrations','manager-v2'));if(!migration.exists())throw new Error('The shared calendar migration is not complete yet. Please finish setup before editing lessons.');}
    const settings = effectiveSettings(scheduleSnap.data());
    if(ownerPolicy&&ownerPolicy.revision!==(settings.revision??''))throw new Error('Availability changed while saving. Review the latest hours and try again.');
    if(options.expectedTimezone&&options.expectedTimezone!==settings.timezone)throw new Error('The calendar timezone changed. Refresh and choose your time again.');
    const entries = lessons.map((l, i) => {
      const before = l.before ?? 0, after = l.after ?? settings.bufferMinutes;
      const grains = intervalGrains(l.start, l.duration, before, after);
      return { l, ref: refs[i]!, before, after, grains, live: !['cancelled','completed','noShow'].includes(l.status ?? 'confirmed') };
    });
    // Public bookings are deliberately unreadable, including a not-yet-created document.
    const oldSnaps = options.public ? entries.map(()=>({data:()=>undefined,exists:()=>false})) : await Promise.all(entries.map(e => tx.get(e.ref)));
    const allIds = new Set<string>();
    entries.forEach((e, i) => {
      if (e.live) e.grains.forEach(g => allIds.add(grainDocId(g)));
      const old = oldSnaps[i]!.data();
      if(old&&e.l.expectedUpdatedAt!==undefined&&(old.updatedAt?.toMillis?.()??0)!==e.l.expectedUpdatedAt)throw new Error('This lesson changed in another window. Reopen it before saving.');
      if (old && lessons[i]!.id && old.lockIds) (old.lockIds as string[]).forEach(id => allIds.add(id));
      if (lessons[i]!.id && !oldSnaps[i]!.exists()) throw new Error('This lesson was removed. Refresh the calendar.');
    });
    // Reserve headroom for metadata, history, day claims and each lesson document.
    if (allIds.size + entries.length * 4 + 8 > 450) throw new Error('This series is too large for one atomic save. Use fewer occurrences.');
    const lockRefs = [...allIds].map(id => doc(db(), 'slotLocks', id));
    const locks = await Promise.all(lockRefs.map(r => tx.get(r)));
    const lockMap = new Map(locks.map(s => [s.id, s]));
    const days = [...new Set([...allIds].map(id => utcDay(Number(id.slice(1)))))];
    const claimSnaps = await Promise.all(days.map(d => tx.get(doc(db(), 'dayClaims', dayId(d)))));
    const permitSnaps = await Promise.all(days.map(d => tx.get(doc(db(), 'availabilityDays', dayId(d)))));
    const claims = new Map(days.map((d,i) => [d, String(claimSnaps[i]!.data()?.bitmap ?? EMPTY_DAY)]));
    const permits = new Map(days.map((d,i) => [d, permitSnaps[i]!.data()]));
    const releasingIds = new Set(entries.map(e => e.ref.id));
    // Remove only locks actually owned by these lessons. Untrusted legacy lockIds cannot release another lesson.
    locks.forEach(s => { if (s.exists() && releasingIds.has(String(s.data().bookingId))) {
      const grain = Number(s.id.slice(1)), d = utcDay(grain);
      claims.set(d, setBits(claims.get(d)!, [grain % 288], '0'));
    }});
    const nextOwners = new Map<string, string>();
    entries.forEach((e,index) => {
      if (!e.live) return;
      const key = toDateKey(e.l.start, settings.timezone);
      if (options.public) {
        const daysOut = daysBetween(todayDateKey(settings.timezone), key);
        if (e.l.start.getTime() < Date.now() + settings.minimumNoticeMinutes * 60000 || daysOut > settings.maximumAdvanceDays || daysOut < 0 || (!settings.allowSameDayBookings && daysOut === 0) || !settings.sessionDurations.includes(e.l.duration)) throw new Error('That time is outside the booking policy. Please choose another slot.');
      }
      if (!options.overrideAvailability && settings.enforcementVersion === 2) {
        const old=oldSnaps[index]!.data();
        const unchanged=old&&old.startAt.toMillis()===e.l.start.getTime()&&old.endAt.toMillis()===e.l.start.getTime()+e.l.duration*60000&&!['cancelled','completed','noShow'].includes(String(old.status));
        const ownerPermits=!options.public&&!unchanged?permitMap({...settings,maximumAdvanceDays:1},ownerPolicy?.exceptions??[],e.l.start):undefined;
        const lessonGrains = intervalGrains(e.l.start, e.l.duration);
        lessonGrains.forEach(g => {
          if(!options.public){if(unchanged||ownerPermits?.get(utcDay(g))?.[g%288]==='1')return;throw new Error('This time is outside your available hours or is blocked. Choose another time or explicitly override availability.');}
          const p = permits.get(utcDay(g));
          if (p?.revision !== settings.revision || String(p?.bitmap ?? '')[g % 288] !== '1') throw new Error('This time is outside your available hours or is blocked. Choose another time or explicitly override availability.');
        });
      }
      e.grains.forEach(g => {
        const id = grainDocId(g), existing = lockMap.get(id);
        if ((existing?.exists() && !releasingIds.has(String(existing.data().bookingId))) || nextOwners.has(id) || claims.get(utcDay(g))?.[g % 288] === '1') throw new Error('That time overlaps a lesson, block, or buffer. Your changes were not saved.');
        nextOwners.set(id, e.ref.id);
      });
    });
    nextOwners.forEach((_owner, id) => { const g = Number(id.slice(1)), d = utcDay(g); claims.set(d, setBits(claims.get(d)!, [g % 288], '1')); });
    // Public writes touch a maximum of two UTC days and exactly one booking. Rules verify exact bitmap delta.
    days.forEach(d => tx.set(doc(db(), 'dayClaims', dayId(d)), {day:d, bitmap:claims.get(d), bookingId:refs[0]!.id, updatedAt:serverTimestamp()}));
    locks.forEach(s => { if (s.exists() && releasingIds.has(String(s.data().bookingId)) && !nextOwners.has(s.id)) tx.delete(s.ref); });
    nextOwners.forEach((bookingId,id) => tx.set(doc(db(),'slotLocks',id), {grain:Number(id.slice(1)),bookingId,createdAt:serverTimestamp()}));
    entries.forEach((e,i) => {
      const old = oldSnaps[i]!.data();
      const l = e.l;
      const payload = {parentName:l.parentName.trim(),studentName:l.studentName.trim(),phone:l.phone.trim(),email:l.email.trim().toLowerCase(),subject:l.subject.trim(),notes:l.notes ?? String(old?.notes??''),...(!options.public&&l.internalNotes!==undefined?{internalNotes:l.internalNotes.slice(0,10000)}:{}),startAt:Timestamp.fromDate(l.start),endAt:Timestamp.fromMillis(l.start.getTime()+l.duration*60000),durationMinutes:l.duration,dateKey:toDateKey(l.start,settings.timezone),timezone:settings.timezone,status:l.status ?? 'confirmed',lockIds:e.live ? e.grains.map(grainDocId) : [],beforeBuffer:e.before,afterBuffer:e.after,schedulingRevision:settings.revision ?? '',updatedAt:serverTimestamp()};
      if (old) tx.update(e.ref,payload);
      else tx.set(e.ref,{...payload,confirmationCode:l.confirmationCode??`JW-${e.ref.id.slice(0,6).toUpperCase()}`,internalNotes:options.public?'':l.internalNotes??'',createdAt:serverTimestamp(),policyAcceptedAt:serverTimestamp()});
      if (!options.public) {
        if (l.meta) tx.set(doc(db(),'sessionDetails',e.ref.id),{...l.meta,updatedAt:serverTimestamp()},{merge:true});
        tx.set(doc(collection(db(),'history')),{bookingId:e.ref.id,action:old?'updated':'created',previous:old ? {startAt:old.startAt,endAt:old.endAt,status:old.status} : null,next:{startAt:payload.startAt,endAt:payload.endAt,status:payload.status},at:serverTimestamp()});
      }
    });
  });
  return refs.map(r=>r.id);
}

/** Atomic release and optional restoration use the same transaction as creation. */
export async function changeLessonStatus(id: string, status: string) {
  offlineGuard();
  // Read via transaction to prevent edits/status races; keep schedule and timing from current record.
  await runTransaction(db(),async tx => {
    const ref=doc(db(),'bookings',id), snap=await tx.get(ref);
    if(!snap.exists()) throw new Error('Lesson no longer exists.');
    const b=snap.data();
    const inactive=['cancelled','completed','noShow'].includes(status);
    if(!inactive) throw new Error('Reopen this lesson using Edit so its time is reserved again.');
    const ids=(b.lockIds ?? []) as string[];
    const locks=await Promise.all(ids.map(k=>tx.get(doc(db(),'slotLocks',k))));
    const days=[...new Set(ids.map(k=>utcDay(Number(k.slice(1)))))];
    const claims=await Promise.all(days.map(d=>tx.get(doc(db(),'dayClaims',dayId(d)))));
    days.forEach((d,i)=>{
      const owned=locks.filter(s=>s.exists()&&s.data().bookingId===id&&utcDay(Number(s.id.slice(1)))===d).map(s=>Number(s.id.slice(1))%288);
      if(claims[i]!.exists()) tx.update(claims[i]!.ref,{bitmap:setBits(String(claims[i]!.data()?.bitmap ?? EMPTY_DAY),owned,'0'),updatedAt:serverTimestamp()});
    });
    locks.forEach(s=>{if(s.exists()&&s.data().bookingId===id) tx.delete(s.ref);});
    tx.update(ref,{status,updatedAt:serverTimestamp(),...(status==='cancelled'?{cancelledAt:serverTimestamp(),cancelledBy:'admin'}:{})});
    tx.set(doc(collection(db(),'history')),{bookingId:id,action:status,at:serverTimestamp(),previous:{status:b.status,startAt:b.startAt},next:{status}});
  });
}

export function watchBookings(next:(rows:Booking[])=>void,error:(e:Error)=>void,from?:string,to?:string) {
  const filters=[];if(from)filters.push(where('dateKey','>=',from));if(to)filters.push(where('dateKey','<=',to));
  return onSnapshot(query(collection(db(),'bookings'),...filters),s=>next(s.docs.map(d=>({id:d.id,...d.data()} as Booking))),error);
}
export function watchGrains(from:number,to:number,next:(grains:Set<number>)=>void,error:(e:Error)=>void) {
  return onSnapshot(query(collection(db(),'slotLocks'),where('grain','>=',from),where('grain','<=',to)),s=>next(new Set(s.docs.map(d=>Number(d.data().grain)))),error);
}

/** Generate finite local-time recurrence. Reject DST gaps instead of shifting a lesson silently. */
export function recurringStarts(start:Date,count:number,everyWeeks:number,timezone:string) {
  if(!Number.isInteger(count)||count<1||count>24||![1,2,4].includes(everyWeeks))throw new Error('Choose 1–24 occurrences, every 1, 2, or 4 weeks.');
  const key=toDateKey(start,timezone), minute=minutesOfDayIn(start,timezone);
  return Array.from({length:count},(_,i)=>{
    const date=addDays(key,i*7*everyWeeks);
    if(!wallTimeExists(date,minute,timezone))throw new Error(`The local time does not exist on ${date} because of daylight saving time. Change this occurrence.`);
    return i===0?new Date(start.getTime()):zonedTimeToUtc(date,minute,timezone);
  });
}

/** All permits and the revision switch commit together; public transactions retry on schedule changes. */
export async function publishAvailability(settings:SchedulingSettings,exceptions:AvailabilityException[],expectedRevision?:string,mutate?:(tx:Transaction)=>void) {
  offlineGuard();
  if(!Number.isInteger(settings.maximumAdvanceDays)||settings.maximumAdvanceDays<1||settings.maximumAdvanceDays>400||!Number.isInteger(settings.bufferMinutes)||settings.bufferMinutes<0||settings.bufferMinutes>120||!Number.isInteger(settings.minimumNoticeMinutes)||settings.minimumNoticeMinutes<0||settings.minimumNoticeMinutes>43200)throw new Error('Use an advance window of 1–400 days, buffer of 0–120 minutes, and notice of 0–43200 minutes.');
  if(!settings.sessionDurations.length||settings.sessionDurations.some(d=>!Number.isInteger(d)||d<5||d>480)||!settings.sessionDurations.includes(settings.defaultDurationMinutes))throw new Error('Bookable durations must be 5–480 whole minutes and include the default duration.');
  new Intl.DateTimeFormat('en-US',{timeZone:settings.timezone}).format();
  settings={...settings,weekly:normalizeWeekly(settings.weekly)};
  if([...Object.values(settings.weekly).flatMap(d=>d.periods),...exceptions.filter(e=>e.date>=todayDateKey(settings.timezone)).flatMap(e=>e.periods)].some(p=>p.start%5!==0||p.end%5!==0))throw new Error('Publish availability windows in 5-minute increments.');
  const revision=crypto.randomUUID();
  const permits=permitDocuments(settings,exceptions);
  await runTransaction(db(),async tx=>{
    const ref=doc(db(),'settings','scheduling'), snap=await tx.get(ref);
    if((snap.data()?.revision??'')!==(expectedRevision??''))throw new Error('Availability changed in another window. Refresh and try again.');
    permits.forEach((data,day)=>tx.set(doc(db(),'availabilityDays',dayId(day)),{...data,revision,updatedAt:serverTimestamp()}));
    tx.set(ref,{...settings,revision,enforcementVersion:2,updatedAt:serverTimestamp()},{merge:true});
    mutate?.(tx);
  });
}
