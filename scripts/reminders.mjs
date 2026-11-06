import nodemailer from 'nodemailer';
import {FieldValue,Timestamp} from 'firebase-admin/firestore';
import {deliverNotification,notificationId} from './outbox.mjs';
import {DateTime} from 'luxon';
import {adminDatabase} from './admin.mjs';
import {interpolate,isQuiet,notificationPlan} from './reminder-policy.mjs';

async function main(){
  if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw new Error('Missing required Actions secret: FIREBASE_SERVICE_ACCOUNT');
  const db=await adminDatabase(), now=Date.now();
  const config=(await db.doc('managerSettings/notifications').get()).data()??{enabled:false,timezone:'America/New_York'};
  // An owner-controlled secret is the recipient allowlist, even for dashboard test requests.
  const recipient=(process.env.OWNER_EMAIL??'').trim().toLowerCase();
  if(config.recipient&&config.recipient.trim().toLowerCase()!==recipient)throw new Error('Dashboard recipient does not match OWNER_EMAIL. Update the secret or saved preference.');
  const workflowTest=process.env.TEST_EMAIL==='true';
  const pendingRequests=await db.collection('notificationRequests').where('createdAt','>=',Timestamp.fromMillis(now-72*3600000)).get();
  if(!config.enabled&&!workflowTest&&pendingRequests.empty){console.log('Owner reminders are disabled.');return;}
  const cursor=(await db.doc('notificationState/cursor').get()).data();
  const since=Timestamp.fromMillis(now-72*3600000);
  const local=DateTime.fromMillis(now,{zone:config.timezone??'America/New_York'}),today=local.toISODate();
  const quiet=isQuiet(now,config);
  const unpaidState=config.unpaid?(await db.doc(`notificationState/${notificationId('unpaid-'+today)}`).get()).data():undefined;
  const weeklyState=config.weekly?(await db.doc(`notificationState/${notificationId('weekly-'+today)}`).get()).data():undefined;
  const inspectUnpaid=!!config.unpaid&&!['sent','nothing-due','uncertain'].includes(unpaidState?.status)&&(unpaidState?.attempts??0)<5&&local.hour>=Number(config.dailyHour??7)&&!quiet;
  const inspectWeekly=!!config.weekly&&!['sent','uncertain'].includes(weeklyState?.status)&&(weeklyState?.attempts??0)<5&&local.weekday%7===Number(config.weeklyDay??0)&&local.hour>=Number(config.dailyHour??7)&&!quiet;
  const [future,changed,completed,created]=await Promise.all([
    db.collection('bookings').where('startAt','>=',Timestamp.fromMillis(now)).where('startAt','<=',Timestamp.fromMillis(now+8*86400000)).get(),
    db.collection('bookings').where('updatedAt','>=',since).get(),
    inspectUnpaid?db.collection('bookings').where('status','==','completed').get():inspectWeekly?db.collection('bookings').where('startAt','>=',Timestamp.fromMillis(now-7*86400000)).get():Promise.resolve({docs:[]}),
    db.collection('bookings').where('createdAt','>=',since).get()
  ]);
  const completedIds=completed.docs.filter(d=>d.data().status==='completed').map(d=>d.id);
  const detailDocs=completedIds.length?await db.getAll(...completedIds.map(id=>db.doc('sessionDetails/'+id))):[];
  const paymentDocs=[];
  for(let n=0;n<completedIds.length;n+=30){const chunk=await db.collection('payments').where('bookingId','in',completedIds.slice(n,n+30)).get();paymentDocs.push(...chunk.docs);}
  const bookings=[...new Map([...future.docs,...changed.docs,...completed.docs,...created.docs].map(d=>[d.id,{id:d.id,...d.data()}])).values()];
  const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
  const plan=notificationPlan({now,lastRun:cursor?.at?.toMillis?.(),settings:{...config,unpaid:inspectUnpaid,weekly:inspectWeekly},bookings,details:detailDocs.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})),payments:paymentDocs.map(d=>({id:d.id,...d.data()})),requests:workflowTest?[{id:`workflow-${process.env.GITHUB_RUN_ID??now}`,type:'test'}]:rows(pendingRequests)});
  // Historical balances are scanned once per day, rather than downloading all history every cron run.
  if(inspectUnpaid&&!plan.some(e=>e.key==='unpaid-'+today))await db.doc(`notificationState/${notificationId('unpaid-'+today)}`).set({type:'Unpaid scan',status:'nothing-due',at:FieldValue.serverTimestamp()});
  if(!plan.length){console.log('No owner notifications are due.');return;}
  for(const key of ['SMTP_USER','SMTP_PASSWORD','OWNER_EMAIL'])if(!process.env[key]){await db.collection('notificationLogs').add({type:'Email setup',status:'failed',errorCode:`MISSING_${key}`,at:FieldValue.serverTimestamp()});throw new Error(`Missing required Actions secret: ${key}`);}
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:20000,socketTimeout:30000});
  // A preflight failure cannot have delivered a message and is safe to retry next cron run.
  try{await transport.verify();}catch(error){await db.collection('notificationLogs').add({type:'SMTP connection',status:'failed',errorCode:String(error.code??error.responseCode??'connection'),at:FieldValue.serverTimestamp()});throw error;}
  let failures=0,sent=0;
  for(const event of plan){
    if(event.type!=='Test email'&&isQuiet(now,config))continue;
    const result=await deliverNotification(db,event,async id=>{
      const values={type:event.type,title:event.title,body:event.body};
      const info=await transport.sendMail({from:process.env.SMTP_USER,to:recipient,subject:interpolate(config.subject||'Tutorly · {{type}}',values).replace(/[\r\n]/g,' ').slice(0,200),text:interpolate(config.template||'{{title}}\n\n{{body}}',values),messageId:`<${id}@tutoring-manager.local>`});
      if(!info.accepted?.length)throw Object.assign(new Error('SMTP rejected the recipient.'),{responseCode:550});
    },now);
    if(result==='sent')sent++;if(result==='failed'||result==='uncertain')failures++;

  }
  transport.close();
  // Do not advance past failures/quiet hours. Deterministic state makes overlapping lookbacks safe.
  if(!failures&&!isQuiet(now,config))await db.doc('notificationState/cursor').set({at:FieldValue.serverTimestamp()});
  console.log(`Owner email run complete: ${sent} sent, ${failures} failed or uncertain.`);
  if(failures)process.exitCode=1;
}
main().catch(error=>{console.error(error.message?.startsWith('Missing required')||error.message?.startsWith('Dashboard recipient')?error.message:'Owner reminders failed. Check Actions secrets, Firebase permissions, and Gmail app-password configuration.');process.exitCode=1;});
