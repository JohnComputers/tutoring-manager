/** Non-destructive v2 migration: requires project admin credentials; never seeds or changes bookings. */
import {FieldValue} from 'firebase-admin/firestore';
import {adminDatabase} from './admin.mjs';
import {permitMap,effectiveSettings,utcDay,dayId,EMPTY_DAY,setBits} from '../src/shared/engine';
import type {AvailabilityException} from '../src/types';
const database=await adminDatabase();
const settingsRef=database.doc('settings/scheduling');
const scheduleSnap=await settingsRef.get();
const settings=effectiveSettings(scheduleSnap.data());
if(process.env.MIGRATION_APPLY!=='true'){
  console.log('Dry run: will backfill occupancy from existing slotLocks and publish revisioned availability. No booking, student, payment, or admin record is modified. Set MIGRATION_APPLY=true to apply.');
}else{
  // Run while v2 rules are deployed and before the new frontend is released. Those rules
  // reject public bookings until the revision switch; cached old clients must refresh.
  const [locks,exceptions]=await Promise.all([database.collection('slotLocks').get(),database.collection('exceptions').get()]);
  const claims=new Map<number,string>();
  locks.docs.forEach(d=>{const grain=Number(d.data().grain),day=utcDay(grain);if(Number.isInteger(grain))claims.set(day,setBits(claims.get(day)??EMPTY_DAY,[grain%288],'1'));});
  const revision=crypto.randomUUID();
  const permits=permitMap(settings,exceptions.docs.map(d=>({id:d.id,...d.data()} as AvailabilityException)));
  // Backfill every existing day without touching booking records. Idempotent reruns preserve current locks.
  for(const [day,bitmap]of claims)await database.doc(`dayClaims/${dayId(day)}`).set({day,bitmap,bookingId:'migration',updatedAt:FieldValue.serverTimestamp()});
  const batch=database.batch();
  permits.forEach((bitmap,day)=>batch.set(database.doc(`availabilityDays/${dayId(day)}`),{day,bitmap,revision,updatedAt:FieldValue.serverTimestamp()}));
  batch.set(settingsRef,{...settings,revision,enforcementVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  batch.set(database.doc('migrations/manager-v2'),{version:2,lockCount:locks.size,claimDays:claims.size,permitDays:permits.size,at:FieldValue.serverTimestamp()});
  await batch.commit();
  console.log(`Migration complete. Preserved all bookings. Backfilled ${claims.size} occupied days and ${permits.size} available days.`);
}
