import {FieldValue} from 'firebase-admin/firestore';
import {adminDatabase} from './admin.mjs';
import {permitMap,effectiveSettings,dayId} from '../src/shared/engine';
import type {AvailabilityException} from '../src/types';
const database=await adminDatabase();
const ref=database.doc('settings/scheduling');
const snapshot=await ref.get(),settings=effectiveSettings(snapshot.data());
if(settings.enforcementVersion!==2)throw new Error('Run the non-destructive migration before refreshing availability.');
const exceptions=await database.collection('exceptions').get();
const permits=permitMap(settings,exceptions.docs.map(d=>({id:d.id,...d.data()} as AvailabilityException)));
const revision=crypto.randomUUID();
await database.runTransaction(async tx=>{
  const fresh=await tx.get(ref);
  if(fresh.data()?.revision!==settings.revision)throw new Error('Schedule changed during refresh. Retry this workflow.');
  permits.forEach((bitmap,day)=>tx.set(database.doc(`availabilityDays/${dayId(day)}`),{day,bitmap,revision,updatedAt:FieldValue.serverTimestamp()}));
  tx.update(ref,{revision,updatedAt:FieldValue.serverTimestamp()});
  tx.set(database.doc('migrations/availability-refresh'),{at:FieldValue.serverTimestamp(),permitDays:permits.size});
});
console.log('Rolling public booking window refreshed. Existing reservations are unchanged.');
