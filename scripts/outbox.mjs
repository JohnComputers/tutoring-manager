import {createHash} from 'node:crypto';
import {FieldValue,Timestamp} from 'firebase-admin/firestore';
export const notificationId=key=>createHash('sha256').update(key).digest('hex');
export async function deliverNotification(db,event,send,now=Date.now()){
  const id=notificationId(event.key),ref=db.doc(`notificationState/${id}`);
  const claimed=await db.runTransaction(async tx=>{
    const state=(await tx.get(ref)).data();
    if(state?.status==='sent'||state?.status==='uncertain')return false;
    if(state?.status==='sending'){
      if(state.leaseUntil?.toMillis?.()<now){tx.update(ref,{status:'uncertain',at:FieldValue.serverTimestamp()});tx.set(db.collection('notificationLogs').doc(),{type:event.type,status:'uncertain',notificationId:id,at:FieldValue.serverTimestamp()});}
      return false;
    }
    if(state?.nextAttempt?.toMillis?.()>now||(state?.attempts??0)>=5)return false;
    tx.set(ref,{type:event.type,status:'sending',attempts:(state?.attempts??0)+1,leaseUntil:Timestamp.fromMillis(now+10*60000),at:FieldValue.serverTimestamp()},{merge:true});return true;
  });
  if(!claimed)return'skipped';
  try{
    await send(id);
    await ref.set({status:'sent',sentAt:FieldValue.serverTimestamp(),at:FieldValue.serverTimestamp()},{merge:true});
    await db.collection('notificationLogs').add({type:event.type,status:'sent',notificationId:id,at:FieldValue.serverTimestamp()});
    return'sent';
  }catch(error){
    const code=String(error.code??error.responseCode??'unknown');
    const definitive=Number(error.responseCode)>=400||['EAUTH','EENVELOPE'].includes(code);
    await ref.set({status:definitive?'failed':'uncertain',lastErrorCode:code,nextAttempt:Timestamp.fromMillis(now+15*60000),at:FieldValue.serverTimestamp()},{merge:true});
    await db.collection('notificationLogs').add({type:event.type,status:definitive?'failed':'uncertain',errorCode:code,notificationId:id,at:FieldValue.serverTimestamp()});
    return definitive?'failed':'uncertain';
  }
}
