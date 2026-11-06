import {getDoc,onSnapshot,query,orderBy,limit,runTransaction,serverTimestamp,setDoc,updateDoc} from 'firebase/firestore';
import {doc,collection} from '@/firebase/workspace';
import {db} from '@/firebase/config';
import {offlineGuard} from '@/shared/engine';
import {blankStudent,contactMatches,ms,type Student,type Lesson,type Detail} from './model';
export function watchCollection<T>(path:string,next:(rows:T[])=>void,error:(e:Error)=>void,bounded=false) {
  const q=bounded?query(collection(db(),path),orderBy('at','desc'),limit(200)):query(collection(db(),path));
  return onSnapshot(q,s=>next(s.docs.map(d=>({id:d.id,...d.data()} as T))),error);
}
export function watchDoc<T>(path:string,fallback:T,next:(v:T)=>void,error:(e:Error)=>void) {
  return onSnapshot(doc(db(),path),s=>next({...fallback,...s.data()} as T),error);
}
export async function saveRecord(path:string,value:object,id?:string,expectedUpdatedAt?:number) {
  offlineGuard();const ref=id?doc(db(),path,id):doc(collection(db(),path));
  await runTransaction(db(),async tx=>{const current=await tx.get(ref);if(expectedUpdatedAt!==undefined&&ms(current.data()?.updatedAt)!==expectedUpdatedAt)throw new Error('This profile changed in another window. Reopen it before saving.');tx.set(ref,{...value,updatedAt:serverTimestamp()},{merge:true});});
  return ref.id;
}
export async function linkIncoming(b:Lesson,students:Student[],details:Detail[],defaultRate=0) {
  if(details.some(d=>d.id===b.id&&d.studentId))return;
  const matches=contactMatches(b,students);
  if(matches.length>1)return;
  const studentId=matches[0]?.id??`website-${b.id}`;
  let resolved:Student|undefined;
  await runTransaction(db(),async tx=>{
    const detailRef=doc(db(),'sessionDetails',b.id),studentRef=doc(db(),'students',studentId);
    const [detail,student,booking]=await Promise.all([tx.get(detailRef),tx.get(studentRef),tx.get(doc(db(),'bookings',b.id))]);
    if(!booking.exists()||detail.data()?.studentId)return;
    if(student.exists()&&contactMatches({id:b.id,...booking.data()} as Lesson,[{id:studentId,...student.data()} as Student]).length!==1)return;
    if(!student.exists()){
      const incoming=booking.data();
      const profile={...blankStudent,rate:defaultRate,duration:Number(incoming.durationMinutes??60),childName:String(incoming.studentName),parentName:String(incoming.parentName),email:String(incoming.email),phone:String(incoming.phone),subjects:String(incoming.subject)};
      tx.set(studentRef,{...profile,createdAt:serverTimestamp()});resolved={id:studentId,...profile};
    }else resolved={id:studentId,...student.data()} as Student;
    tx.set(detailRef,{studentId,price:Math.round(Number(student.data()?.rate??defaultRate)*Number(booking.data().durationMinutes)/60),location:'',topics:'',progress:'',homework:'',nextSteps:'',source:'website',updatedAt:serverTimestamp()},{merge:true});
  });
  return resolved;
}
export async function recordPayment(bookingId:string,studentId:string,amount:number,method:string,date:string,note:string) {
  offlineGuard();
  if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Enter a positive payment amount.');
  // Idempotency key retained by caller across retries; transaction prevents an accidental double submit.
  return saveRecord('payments',{bookingId,studentId,amount,method,date,note,createdAt:serverTimestamp()});
}
export async function requestTestEmail(){offlineGuard();await setDoc(doc(collection(db(),'notificationRequests')),{type:'test',createdAt:serverTimestamp()});}
export async function setPrivateNotes(id:string,notes:string){offlineGuard();await updateDoc(doc(db(),'bookings',id),{internalNotes:notes,updatedAt:serverTimestamp()});}
export async function checkAdmin(uid:string){return(await getDoc(doc(db(),'admins',uid))).exists();}
