import type {AvailabilityException} from '@/types';
import {getWallClock,makeDateKey} from '@/utils/time';
import {resolvePeriodsForDate} from '@/utils/slots';
import {alive,ms,type Detail,type Lesson,type Schedule} from './model';
export interface ScheduleConflict {lesson:Lesson;reason:string}
/** View-only diagnostics over the shared records; never removes or hides a booked lesson. */
export function findConflicts(lessons:Lesson[],schedule:Schedule,exceptions:AvailabilityException[],details:Detail[],now=Date.now()):ScheduleConflict[]{
  const upcoming=lessons.filter(b=>alive(b)&&ms(b.endAt)>now);
  const reasons=new Map<string,Set<string>>();
  const add=(id:string,reason:string)=>reasons.set(id,new Set([...(reasons.get(id)??[]),reason]));
  const windows=new Map<string,ReturnType<typeof resolvePeriodsForDate>>();
  for(const b of upcoming){
    if(details.find(d=>d.id===b.id)?.availabilityOverride)continue;
    for(let grain=Math.floor(ms(b.startAt)/300000);grain<Math.ceil(ms(b.endAt)/300000);grain++){
      const wall=getWallClock(new Date(grain*300000),schedule.timezone),key=makeDateKey(wall.year,wall.month,wall.day);
      if(!windows.has(key))windows.set(key,resolvePeriodsForDate(key,schedule,exceptions));
      const minute=wall.hour*60+wall.minute;
      if(!windows.get(key)!.some(p=>minute>=p.start&&minute+5<=p.end)){add(b.id,'Outside current available hours');break;}
    }
  }
  const intervals=upcoming.map(b=>({b,start:ms(b.startAt)-(b.beforeBuffer??0)*60000,end:ms(b.endAt)+(b.afterBuffer??schedule.bufferMinutes)*60000})).sort((a,b)=>a.start-b.start);
  let active:typeof intervals=[];
  for(const current of intervals){
    active=active.filter(a=>a.end>current.start);
    for(const other of active){add(current.b.id,'Overlaps another lesson or buffer');add(other.b.id,'Overlaps another lesson or buffer');}
    active.push(current);
  }
  return upcoming.filter(b=>reasons.has(b.id)).map(lesson=>({lesson,reason:[...reasons.get(lesson.id)!].join(' · ')}));
}
