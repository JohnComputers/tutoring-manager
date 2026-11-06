import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {EMPTY_DAY,dayId,intervalGrains,permitDocuments,setBits,utcDay} from '../shared/engine';
import {DEFAULT_SCHEDULING} from '../services/defaults';
import {addDays,todayDateKey,toDateKey,zonedTimeToUtc} from '../utils/time';
let env:RulesTestEnvironment;
const start=new Date(Date.now()+7*86400000),duration=60;
const grains=intervalGrains(start,duration,0,15),first=grains[0]!,last=grains[grains.length-1]!;
const settings={...DEFAULT_SCHEDULING,minimumNoticeMinutes:0,maximumAdvanceDays:60,sessionDurations:[30,60,90,480],allowSameDayBookings:true,enforcementVersion:2,revision:'test'};
const anon=()=>env.unauthenticatedContext().firestore(),owner=()=>env.authenticatedContext('owner').firestore(),stranger=()=>env.authenticatedContext('stranger').firestore();
function payload(overrides:Record<string,unknown>={}){return{confirmationCode:'JW-TEST12',parentName:'Test Parent',studentName:'Test',phone:'7865551234',email:'',subject:'Math',notes:'',startAt:Timestamp.fromDate(start),endAt:Timestamp.fromMillis(start.getTime()+duration*60000),durationMinutes:duration,dateKey:toDateKey(start,'America/New_York'),timezone:'America/New_York',status:'confirmed',internalNotes:'',lockIds:grains.map(g=>'g'+g),beforeBuffer:0,afterBuffer:15,schedulingRevision:'test',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),policyAcceptedAt:serverTimestamp(),...overrides};}
function batchBooking(database:ReturnType<typeof anon>,id:string,overrides:Record<string,unknown>={},skipLocks=false){
 const data=payload(overrides),occupied=intervalGrains(data.startAt.toDate(),Math.round((data.endAt.toMillis()-data.startAt.toMillis())/60000),Number(data.beforeBuffer),Number(data.afterBuffer));
 if(!('lockIds' in overrides))data.lockIds=occupied.map(g=>'g'+g);
 const batch=writeBatch(database);batch.set(doc(database,'bookings',id),data);
 const groups=new Map<number,number[]>();occupied.forEach(g=>groups.set(utcDay(g),[...(groups.get(utcDay(g))??[]),g%288]));
 groups.forEach((indexes,day)=>batch.set(doc(database,'dayClaims',dayId(day)),{day,bitmap:setBits(EMPTY_DAY,indexes,'1'),bookingId:id,updatedAt:serverTimestamp()}));
 if(!skipLocks)occupied.forEach(g=>batch.set(doc(database,'slotLocks','g'+g),{grain:g,bookingId:id,createdAt:serverTimestamp()}));return batch;
}
beforeAll(async()=>{env=await initializeTestEnvironment({projectId:'rules-test',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'admins','owner'),{role:'owner'});await setDoc(doc(c.firestore(),'settings','scheduling'),settings);await setDoc(doc(c.firestore(),'migrations','manager-v2'),{version:2});const permits=permitDocuments(settings,[]);for(const day of new Set([...grains.map(utcDay),...grains.map(g=>utcDay(g)+1),Math.floor(Date.now()/86400000),Math.floor(Date.now()/86400000)+1]))await setDoc(doc(c.firestore(),'availabilityDays',dayId(day)),{...permits.get(day)!,bitmap:'1'.repeat(288),revision:'test'});});});
afterAll(async()=>{await env?.cleanup();});
describe('private access boundary',()=>{
 it('preserves the existing admin allowlist; no account can promote itself',async()=>{await assertFails(setDoc(doc(stranger(),'admins','stranger'),{role:'owner'}));await assertFails(setDoc(doc(owner(),'admins','second'),{}));await assertSucceeds(getDoc(doc(owner(),'admins','owner')));await assertFails(getDoc(doc(stranger(),'admins','owner')));});
 for(const path of ['bookings','students','sessionDetails','payments','managerSettings','history','notificationLogs','notificationState','notificationRequests'])it(`denies public and signed-in stranger reads of ${path}`,async()=>{await assertFails(getDocs(collection(anon(),path)));await assertFails(getDocs(collection(stranger(),path)));await assertSucceeds(getDocs(collection(owner(),path)));});
 for(const path of ['students','sessionDetails','payments','managerSettings'])it(`denies unauthorized writes to ${path}`,async()=>{await assertFails(setDoc(doc(anon(),path,'x'),{private:'data'}));await assertFails(setDoc(doc(stranger(),path,'x'),{private:'data'}));await assertSucceeds(setDoc(doc(owner(),path,'x'),{private:'data'}));});
 it('keeps only availability and opaque reservation markers publicly readable',async()=>{for(const path of ['settings','exceptions','availabilityDays','dayClaims','slotLocks','subjects'])await assertSucceeds(getDocs(collection(anon(),path)));});
 it('forbids public settings, exception, permit and membership edits',async()=>{for(const path of ['settings','exceptions','availabilityDays'])await assertFails(setDoc(doc(anon(),path,'x'),{bitmap:'1'.repeat(288)}));});
});
describe('server-side public booking enforcement',()=>{
 it('accepts an atomic booking with every original grain and bitmap claim',async()=>{await assertSucceeds(batchBooking(anon(),'valid').commit());});
 it('rejects standalone bookings with no occupancy claim',async()=>{await assertFails(setDoc(doc(anon(),'bookings','naked'),payload()));});
 it('rejects orphan reservation writes',async()=>{await assertFails(setDoc(doc(anon(),'slotLocks','g'+first),{grain:first,bookingId:'missing',createdAt:serverTimestamp()}));});
 it('rejects two simultaneous public claims even if a hostile client omits interior grains',async()=>{const results=await Promise.allSettled([batchBooking(anon(),'a',{},true).commit(),batchBooking(anon(),'b',{},true).commit()]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);});
 it('rejects a forged claim over an occupied interval',async()=>{await assertSucceeds(batchBooking(anon(),'first').commit());await assertFails(batchBooking(anon(),'second',{},true).commit());});
 it('enforces configured closed hours on the rules boundary',async()=>{await env.withSecurityRulesDisabled(async c=>{for(const d of new Set(grains.map(utcDay)))await updateDoc(doc(c.firestore(),'availabilityDays',dayId(d)),{bitmap:EMPTY_DAY});});await assertFails(batchBooking(anon(),'closed').commit());});
 it('accepts the entire final local booking day, including times later than the current clock time',async()=>{
   await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'settings','scheduling'),{maximumAdvanceDays:7}));
   const date=addDays(todayDateKey('America/New_York'),7),late=zonedTimeToUtc(date,1380,'America/New_York');
   await assertSucceeds(batchBooking(anon(),'last-day',{startAt:Timestamp.fromDate(late),endAt:Timestamp.fromMillis(late.getTime()+3600000),dateKey:date}).commit());
 });
 it('rejects a valid open interval one local day beyond the configured advance window',async()=>{
   await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'settings','scheduling'),{maximumAdvanceDays:7}));
   const date=addDays(todayDateKey('America/New_York'),8),late=zonedTimeToUtc(date,600,'America/New_York');
   await assertFails(batchBooking(anon(),'too-far',{startAt:Timestamp.fromDate(late),endAt:Timestamp.fromMillis(late.getTime()+3600000),dateKey:date}).commit());
 });
 it('rejects forged update timestamps that could suppress owner notifications',async()=>{await assertFails(batchBooking(anon(),'forged-update',{updatedAt:Timestamp.fromMillis(Date.now()+864000000)}).commit());});
 it('rejects stale availability revisions',async()=>{await assertFails(batchBooking(anon(),'stale',{schedulingRevision:'old'}).commit());});
 it('rejects a forged local date even when the UTC interval is otherwise valid',async()=>{await assertFails(batchBooking(anon(),'wrong-date',{dateKey:'2000-01-01'}).commit());});
 it('does not let a cached admin change hours without publishing a new revision',async()=>{await assertFails(updateDoc(doc(owner(),'settings','scheduling'),{timezone:'UTC'}));});
 it('requires the configured buffer and session duration',async()=>{await assertFails(batchBooking(anon(),'buffer',{afterBuffer:0}).commit());await assertFails(batchBooking(anon(),'duration',{durationMinutes:70}).commit());});
 it('prevents public cancellation, notes injection, lock deletion and existing lock overwrite',async()=>{await assertSucceeds(batchBooking(anon(),'existing').commit());await assertFails(updateDoc(doc(anon(),'bookings','existing'),{status:'cancelled'}));await assertFails(deleteDoc(doc(anon(),'slotLocks','g'+first)));await assertFails(setDoc(doc(anon(),'slotLocks','g'+first),{grain:first,bookingId:'attacker',createdAt:serverTimestamp()}));});
 it('rejects private field injection and claiming another booking time',async()=>{await assertFails(batchBooking(anon(),'private',{internalNotes:'injected'}).commit());await assertFails(batchBooking(anon(),'pii',{studentId:'private-link'}).commit());});
 it('does not let the public clear a bitmap',async()=>{await assertSucceeds(batchBooking(anon(),'exists').commit());await assertFails(updateDoc(doc(anon(),'dayClaims',dayId(utcDay(last))),{bitmap:EMPTY_DAY}));});
});

describe('isolated personal workspaces',()=>{
 const account=(uid:string,verified=true)=>env.authenticatedContext(uid,{email_verified:verified}).firestore();
 it('lets verified accounts manage every personal feature without admin membership',async()=>{for(const kind of ['students','bookings','sessionDetails','payments','settings','managerSettings','exceptions','slotLocks','dayClaims','availabilityDays','history','migrations']){const ref=doc(account('alice'),'workspaces/alice/'+kind+'/sample');await assertSucceeds(setDoc(ref,{sample:true}));await assertSucceeds(getDoc(ref));}});
 it('denies cross-account access, including the integrated administrator',async()=>{await assertSucceeds(setDoc(doc(account('alice'),'workspaces/alice/students/sample'),{name:'Private'}));for(const database of [anon(),account('bob'),owner()]){await assertFails(getDoc(doc(database,'workspaces/alice/students/sample')));await assertFails(setDoc(doc(database,'workspaces/alice/payments/sample'),{amount:100}));}});
 it('rejects unverified accounts and tenant attempts to use global records or worker queues',async()=>{await assertFails(setDoc(doc(account('alice',false),'workspaces/alice/students/sample'),{}));for(const path of ['admins/alice','students/sample','managerSettings/preferences','notificationRequests/sample','workspaces/alice/admins/sample','workspaces/alice/notificationRequests/sample'])await assertFails(setDoc(doc(account('alice'),path),{}));await assertFails(getDocs(collection(account('alice'),'bookings')));});
 it('keeps personal lesson history immutable',async()=>{const ref=doc(account('alice'),'workspaces/alice/history/sample');await assertSucceeds(setDoc(ref,{action:'created'}));await assertFails(updateDoc(ref,{action:'changed'}));await assertFails(deleteDoc(ref));});
});
