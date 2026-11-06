import { collection, doc, getDoc, getDocs, limit as limitTo, orderBy, query, serverTimestamp, updateDoc, where, runTransaction } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Booking, BookingFormValues, BookingStatus, IsoDate, SchedulingSettings } from '@/types';
import { SlotTakenError, ValidationError } from '@/utils/errors';
import { dayGrainBounds, grainFromDocId } from '@/utils/slots';
import { cleanMultiline,cleanText,generateConfirmationCode,hasErrors,initialsOf,normalisePhone,validateBookingForm } from '@/utils/validation';
import { saveLessons,changeLessonStatus,offlineGuard,utcDay,dayId,EMPTY_DAY,setBits } from '@/shared/engine';
const BOOKINGS='bookings',LOCKS='slotLocks';
export interface CreateBookingInput {start:Date;durationMinutes:number;values:BookingFormValues;scheduling:SchedulingSettings;tutorName:string}
export interface BookingReceipt {bookingId:string;confirmationCode:string;parentName:string;studentName:string;phone:string;email:string;subject:string;notes:string;start:Date;end:Date;durationMinutes:number;timezone:string}
export async function getOccupiedGrains(dateKey:IsoDate,scheduling:SchedulingSettings):Promise<Set<number>> {
 return getOccupiedGrainsForRange(dateKey,dateKey,scheduling);
}
export async function getOccupiedGrainsForRange(from:IsoDate,to:IsoDate,scheduling:SchedulingSettings):Promise<Set<number>> {
 const first=dayGrainBounds(from,scheduling.timezone,scheduling.bufferMinutes).first,last=dayGrainBounds(to,scheduling.timezone,scheduling.bufferMinutes).last;
 const [locks,claims]=await Promise.all([getDocs(query(collection(db(),LOCKS),where('grain','>=',first),where('grain','<=',last))),getDocs(query(collection(db(),'dayClaims'),where('day','>=',utcDay(first)),where('day','<=',utcDay(last))))]);
 const grains=new Set(locks.docs.map(d=>Number(d.data().grain??grainFromDocId(d.id))));
 claims.docs.forEach(d=>{const data=d.data();String(data.bitmap??'').split('').forEach((bit,i)=>{if(bit==='1')grains.add(Number(data.day)*288+i);});});return grains;
}
export async function createBooking(input:CreateBookingInput):Promise<BookingReceipt>{
 const {start,durationMinutes,values,scheduling,tutorName}=input;
 const errors=validateBookingForm(values,scheduling);if(hasErrors(errors))throw new ValidationError(errors);
 if(!Number.isInteger(durationMinutes)||durationMinutes<5||durationMinutes>480||!(start instanceof Date)||!Number.isFinite(start.getTime()))throw new ValidationError({},'That session time or duration is not valid.');
 const confirmationCode=generateConfirmationCode(initialsOf(tutorName));
 const clean={parentName:cleanText(values.parentName),studentName:cleanText(values.studentName),phone:normalisePhone(values.phone),email:cleanText(values.email).toLowerCase(),subject:cleanText(values.subject),notes:cleanMultiline(values.notes)};
 let bookingId:string|undefined;
 try{[bookingId]=await saveLessons([{start,duration:durationMinutes,...clean,confirmationCode}],{public:true,expectedTimezone:scheduling.timezone});}
 catch(e){if(e instanceof Error&&/overlap/.test(e.message))throw new SlotTakenError();if(e instanceof Error&&/timezone|outside|booking policy/.test(e.message))throw new ValidationError({},e.message);throw e;}
 return {bookingId:bookingId!,confirmationCode,...clean,start,end:new Date(start.getTime()+durationMinutes*60000),durationMinutes,timezone:scheduling.timezone};
}
function toBooking(id: string, data: Record<string, unknown>): Booking {
  return {
    id,
    confirmationCode: String(data.confirmationCode ?? ''),
    parentName: String(data.parentName ?? ''),
    studentName: String(data.studentName ?? ''),
    phone: String(data.phone ?? ''),
    email: String(data.email ?? ''),
    subject: String(data.subject ?? ''),
    notes: String(data.notes ?? ''),
    startAt: data.startAt as Booking['startAt'],
    endAt: data.endAt as Booking['endAt'],
    durationMinutes: Number(data.durationMinutes ?? 0),
    dateKey: String(data.dateKey ?? ''),
    timezone: String(data.timezone ?? 'America/New_York'),
    status: (String(data.status ?? 'confirmed') as BookingStatus),
    internalNotes: String(data.internalNotes ?? ''),
    lockIds: Array.isArray(data.lockIds) ? data.lockIds.map(String) : [],
    policyAcceptedAt: data.policyAcceptedAt as Booking['policyAcceptedAt'],
    createdAt: data.createdAt as Booking['createdAt'],
    updatedAt: data.updatedAt as Booking['updatedAt'],
    cancelledAt: data.cancelledAt as Booking['cancelledAt'],
    cancelledBy: data.cancelledBy ? String(data.cancelledBy) : undefined,
  };
}

export interface BookingQuery {
  /** Inclusive date-key lower bound. */
  fromDate?: IsoDate;
  /** Inclusive date-key upper bound. */
  toDate?: IsoDate;
  status?: BookingStatus | 'all';
  max?: number;
}

/**
 * Bookings, newest-first within the requested window.
 *
 * Always bounded: an unbounded query would grow without limit and eventually time out
 * on the admin dashboard. Callers pass the window they actually render.
 */
export async function getBookings(options: BookingQuery = {}): Promise<Booking[]> {
  const { fromDate, toDate, status = 'all', max = 200 } = options;

  const constraints = [];
  if (fromDate) constraints.push(where('dateKey', '>=', fromDate));
  if (toDate) constraints.push(where('dateKey', '<=', toDate));
  if (status !== 'all') constraints.push(where('status', '==', status));

  // `dateKey` needs to lead the ordering because it carries the range filter.
  const snapshot = await getDocs(
    query(
      collection(db(), BOOKINGS),
      ...constraints,
      orderBy('dateKey', 'desc'),
      orderBy('startAt', 'desc'),
      limitTo(max),
    ),
  );
  return snapshot.docs.map((d) => toBooking(d.id, d.data()));
}

/** Confirmed sessions from `fromDate` onward, soonest first. */
export async function getUpcomingBookings(
  fromDate: IsoDate,
  max = 100,
): Promise<Booking[]> {
  const snapshot = await getDocs(
    query(
      collection(db(), BOOKINGS),
      where('dateKey', '>=', fromDate),
      where('status', '==', 'confirmed'),
      orderBy('dateKey'),
      orderBy('startAt'),
      limitTo(max),
    ),
  );
  return snapshot.docs.map((d) => toBooking(d.id, d.data()));
}

export async function getBooking(id: string): Promise<Booking | null> {
  const snapshot = await getDoc(doc(db(), BOOKINGS, id));
  return snapshot.exists() ? toBooking(snapshot.id, snapshot.data()) : null;
}


export async function cancelBooking(id:string,_cancelledBy='admin'):Promise<void>{await changeLessonStatus(id,'cancelled');}
export async function rescheduleBooking(id:string,newStart:Date,durationMinutes:number,_scheduling:SchedulingSettings):Promise<void>{
 const b=await getBooking(id);if(!b)throw new Error('That booking no longer exists.');
 const raw=await getDoc(doc(db(),BOOKINGS,id));const data=raw.data()!;
 try{await saveLessons([{id,start:newStart,duration:durationMinutes,parentName:b.parentName,studentName:b.studentName,phone:b.phone,email:b.email,subject:b.subject,notes:b.notes,before:Number(data.beforeBuffer??0),after:Number(data.afterBuffer??_scheduling.bufferMinutes),status:'confirmed'}]);}
 catch(e){if(e instanceof Error&&/overlap/.test(e.message))throw new SlotTakenError();throw e;}
}
export async function setBookingStatus(id:string,status:BookingStatus):Promise<void>{
 if(status==='confirmed'){const b=await getBooking(id);if(!b)throw new Error('That booking no longer exists.');await rescheduleBooking(id,b.startAt.toDate(),b.durationMinutes,{bufferMinutes:15} as SchedulingSettings);return;}
 await changeLessonStatus(id,status);
}
export async function setInternalNotes(id:string,notes:string):Promise<void>{offlineGuard();await updateDoc(doc(db(),BOOKINGS,id),{internalNotes:cleanMultiline(notes).slice(0,2000),updatedAt:serverTimestamp()});}
/** Owner maintenance rechecks each reservation and its booking inside the same transaction. */
export async function releaseOrphanedLocks(from:IsoDate,scheduling:SchedulingSettings):Promise<number>{
 offlineGuard();const first=dayGrainBounds(from,scheduling.timezone,scheduling.bufferMinutes).first;
 const locks=await getDocs(query(collection(db(),LOCKS),where('grain','>=',first)));let released=0;
 for(const lock of locks.docs){await runTransaction(db(),async tx=>{const fresh=await tx.get(lock.ref);if(!fresh.exists())return;const b=await tx.get(doc(db(),BOOKINGS,String(fresh.data().bookingId)));if(b.exists()&&!['cancelled','completed','noShow'].includes(String(b.data().status)))return;const grain=Number(fresh.data().grain),ref=doc(db(),'dayClaims',dayId(utcDay(grain))),claim=await tx.get(ref);if(claim.exists())tx.update(ref,{bitmap:setBits(String(claim.data().bitmap??EMPTY_DAY),[grain%288],'0'),updatedAt:serverTimestamp()});tx.delete(lock.ref);released++;});}return released;
}
