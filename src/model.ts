import type { Booking, SchedulingSettings } from '@/types';
export type Lesson=Omit<Booking,'status'> & {status:string;beforeBuffer?:number;afterBuffer?:number};
export interface Student {id:string;childName:string;parentName:string;grade:string;school:string;subjects:string;courseLevel:string;email:string;phone:string;preferredTimes:string;rate:number;duration:number;tags:string;color:string;goals:string;strengths:string;weaknesses:string;materials:string;notes:string;active:boolean;customFields:string;recurringSchedule:string;billingNotes:string}
export interface Detail {id:string;studentId:string;price:number;location:string;topics:string;progress:string;homework:string;nextSteps:string;seriesId?:string;source?:string}
export interface Payment {id:string;bookingId:string;studentId:string;amount:number;method:string;date:string;note:string}
export interface Preferences {theme:string;accent:string;timeFormat:string;firstDay:number;increment:number;defaultDuration:number;defaultRate:number;calendarColorBy:string;hiddenFields:string;fieldOrder:string;customTags:string;customStatuses:string;widgets:string}
export interface Notifications {enabled:boolean;recipient:string;timezone:string;leads:string;daily:boolean;dailyHour:number;changes:boolean;unpaid:boolean;weekly:boolean;weeklyDay:number;quietStart:number;quietEnd:number;subject:string;template:string}
export type Schedule=SchedulingSettings & {revision?:string;enforcementVersion?:number;blockedWeekly?:Record<string,{start:number;end:number}[]>};
export const defaultPrefs:Preferences={theme:'system',accent:'#34695b',timeFormat:'12',firstDay:1,increment:30,defaultDuration:60,defaultRate:0,calendarColorBy:'student',hiddenFields:'',fieldOrder:'grade,school,courseLevel,preferredTimes,goals,strengths,weaknesses,materials,recurringSchedule,billingNotes,customFields,notes',customTags:'',customStatuses:'',widgets:'schedule,metrics,balances,notes'};
export const defaultNotifications:Notifications={enabled:false,recipient:'',timezone:'America/New_York',leads:'1440,60',daily:true,dailyHour:7,changes:true,unpaid:true,weekly:false,weeklyDay:0,quietStart:22,quietEnd:7,subject:'Tutorly · {{type}}',template:'{{title}}\n\n{{body}}\n\nYour private tutoring workspace'};
export const blankStudent:Omit<Student,'id'>={childName:'',parentName:'',grade:'',school:'',subjects:'',courseLevel:'',email:'',phone:'',preferredTimes:'',rate:0,duration:60,tags:'',color:'#5575b5',goals:'',strengths:'',weaknesses:'',materials:'',notes:'',active:true,customFields:'',recurringSchedule:'',billingNotes:''};
export const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const ms=(v:unknown):number=>v&&typeof v==='object'&&'toMillis' in v?(v as {toMillis:()=>number}).toMillis():0;
export const alive=(b:Lesson)=>!['cancelled','completed','noShow'].includes(b.status);
export const paidFor=(id:string,p:Payment[])=>p.filter(x=>x.bookingId===id).reduce((s,x)=>s+x.amount,0);
export function contactMatches(b:Pick<Lesson,'email'|'phone'|'studentName'>,students:Student[]) {
  const email=b.email.trim().toLowerCase();
  const phone=(s:string)=>{const p=s.replace(/\D/g,'');return p.length===11&&p.startsWith('1')?p.slice(1):p;};
  // A shared guardian contact alone is insufficient: siblings must remain separate.
  return students.filter(s=>s.childName.trim().toLowerCase()===b.studentName.trim().toLowerCase()&&((email&&s.email.trim().toLowerCase()===email)||(phone(b.phone).length>=10&&phone(s.phone)===phone(b.phone))));
}
