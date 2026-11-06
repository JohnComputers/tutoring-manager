import {DateTime} from 'luxon';
export const millis=v=>v?.toMillis?.()??(v?.seconds?Number(v.seconds)*1000:0);
export function localClock(now,zone){return DateTime.fromMillis(now,{zone});}
export function isQuiet(now,settings){const hour=localClock(now,settings.timezone).hour;const a=Number(settings.quietStart),b=Number(settings.quietEnd);return a===b?false:a<b?hour>=a&&hour<b:hour>=a||hour<b;}
export function interpolate(template,values){return template.replace(/\{\{(type|title|body)\}\}/g,(_,key)=>String(values[key]??''));}
export function lessonFingerprint(b){return `${millis(b.startAt)}-${millis(b.endAt)}-${b.status}`;}
/** A cursor plus a 72h bounded lookback catches delayed cron runs; deterministic keys suppress repeat sends. */
export function notificationPlan({now,lastRun,settings,bookings,details,payments,requests}){
  const zone=settings.timezone??'America/New_York',local=localClock(now,zone),today=local.toISODate();
  const since=Math.max(now-72*3600000,Math.min(lastRun||now-24*3600000,now-24*3600000));
  const events=[];
  const add=(key,type,title,body)=>events.push({key,type,title,body});
  const line=b=>`${DateTime.fromMillis(millis(b.startAt),{zone}).toFormat('ccc, LLL d · h:mm a ZZZZ')} — ${b.studentName} · ${b.subject||'Tutoring'} (${b.durationMinutes} min)`;
  const live=bookings.filter(b=>!['cancelled','completed','noShow'].includes(b.status));
  if(settings.enabled){
    const leads=[...new Set(String(settings.leads??'1440,60').split(',').map(Number).filter(n=>Number.isFinite(n)&&n>=1&&n<=10080))];
    live.forEach(b=>{const start=millis(b.startAt);if(start<=now)return;leads.forEach(lead=>{const due=start-lead*60000;if(due<=now&&due>=since)add(`reminder-${b.id}-${start}-${lead}`,'Upcoming lesson',`A lesson is coming up`,line(b));});});
    if(settings.daily&&local.hour>=Number(settings.dailyHour??7)){
      const agenda=live.filter(b=>DateTime.fromMillis(millis(b.startAt),{zone}).toISODate()===today).sort((a,b)=>millis(a.startAt)-millis(b.startAt));
      add(`agenda-${today}`,'Daily agenda',`Your teaching day · ${local.toFormat('LLLL d')}`,agenda.length?agenda.map(line).join('\n'):'A little breathing room. No lessons scheduled today.');
    }
    if(settings.changes)bookings.forEach(b=>{const changed=Math.max(millis(b.updatedAt),millis(b.createdAt),millis(b.cancelledAt));if(changed<since||changed>now)return;const type=b.status==='cancelled'?'Lesson canceled':millis(b.updatedAt)>millis(b.createdAt)?'Lesson updated':'New website booking';add(`change-${b.id}-${lessonFingerprint(b)}`,type,type,line(b));});
    if(settings.unpaid){
      const owed=bookings.filter(b=>b.status==='completed').map(b=>{const due=Number(details.find(d=>d.id===b.id)?.price??0)-payments.filter(p=>p.bookingId===b.id).reduce((s,p)=>s+Number(p.amount),0);return{b,due};}).filter(x=>x.due>0);
      if(owed.length)add(`unpaid-${today}`,'Unpaid lessons',`${owed.length} lessons have a balance`,owed.map(x=>`${line(x.b)} — $${(x.due/100).toFixed(2)} outstanding`).join('\n'));
    }
    if(settings.weekly&&local.weekday%7===Number(settings.weeklyDay??0)&&local.hour>=Number(settings.dailyHour??7)){
      const week=bookings.filter(b=>b.status==='completed'&&millis(b.startAt)>=now-7*86400000&&millis(b.startAt)<=now);
      const cents=week.reduce((s,b)=>s+Number(details.find(d=>d.id===b.id)?.price??0),0);
      add(`weekly-${today}`,'Weekly summary','A week of little milestones',`${week.length} completed lessons · ${(week.reduce((s,b)=>s+b.durationMinutes,0)/60).toFixed(1)} teaching hours · $${(cents/100).toFixed(2)} earned`);
    }
  }
  requests.forEach(r=>{if(r.type==='test')add(`test-${r.id}`,'Test email','Your owner reminders are connected','This message was requested from your private tutoring workspace. All reminders go only to the configured owner recipient.');});
  return events;
}
