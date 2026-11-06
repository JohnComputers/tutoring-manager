import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
// @ts-expect-error Production Node outbox module shared with the secure reminder workflow.
import {deliverNotification,notificationId} from '../../scripts/outbox.mjs';
const database=getFirestore(initializeApp({projectId:'rules-test'},'outbox-tests'));
const event={key:'session-fixture-60',type:'Upcoming lesson'};
beforeEach(async()=>{expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();await fetch('http://127.0.0.1:8080/emulator/v1/projects/rules-test/databases/(default)/documents',{method:'DELETE'});});
afterAll(async()=>{await database.terminate();});
describe('persistent owner reminder delivery protocol',()=>{
 it('claims concurrent runs once and persists idempotency across later runs',async()=>{let deliveries=0;const send=async()=>{deliveries++;};const results=await Promise.all([deliverNotification(database,event,send),deliverNotification(database,event,send),deliverNotification(database,event,send)]);expect(deliveries).toBe(1);expect(results.filter((r:string)=>r==='sent')).toHaveLength(1);await deliverNotification(database,event,send);expect(deliveries).toBe(1);});
 it('retries definitive SMTP failures after backoff',async()=>{const now=Date.now();const failed=await deliverNotification(database,event,async()=>{throw Object.assign(new Error('Temporary SMTP failure'),{responseCode:450});},now);expect(failed).toBe('failed');let sent=0;expect(await deliverNotification(database,event,async()=>{sent++;},now+1000)).toBe('skipped');expect(await deliverNotification(database,event,async()=>{sent++;},now+16*60000)).toBe('sent');expect(sent).toBe(1);});
 it('does not resend after an ambiguous network failure',async()=>{let attempts=0;expect(await deliverNotification(database,event,async()=>{attempts++;throw Object.assign(new Error('Connection lost'),{code:'ESOCKET'});})).toBe('uncertain');await deliverNotification(database,event,async()=>{attempts++;},Date.now()+3600000);expect(attempts).toBe(1);});
 it('marks an expired in-flight lease uncertain and records an actionable log',async()=>{await database.doc('notificationState/'+notificationId(event.key)).set({status:'sending',leaseUntil:Timestamp.fromMillis(Date.now()-1),attempts:1});let attempts=0;await deliverNotification(database,event,async()=>{attempts++;});expect(attempts).toBe(0);expect((await database.doc('notificationState/'+notificationId(event.key)).get()).data()?.status).toBe('uncertain');expect((await database.collection('notificationLogs').get()).size).toBe(1);});
});
