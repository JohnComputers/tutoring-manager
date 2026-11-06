import {describe,it,expect} from 'vitest';
import {Timestamp} from 'firebase/firestore';
import {blankStudent,contactMatches,paidFor} from '../../model';
import {EMPTY_DAY,intervalGrains,permitDocuments,permitMap,recurringStarts,setBits,utcDay} from '../../shared/engine';
import {DEFAULT_SCHEDULING} from '../../services/defaults';
import {toDateKey,zonedTimeToUtc,minutesOfDayIn} from '../time';
import {normalizeWeekly,resolvePeriodsForDate} from '../slots';
// @ts-expect-error MJS is intentionally shared with the secure Node reminder runner.
import {isQuiet,notificationPlan} from '../../../scripts/reminder-policy.mjs';
describe('shared scheduling policy',()=>{
  it('publishes exact timezone clock transitions for server-side local-date policies',()=>{
    const days=permitDocuments({...DEFAULT_SCHEDULING,maximumAdvanceDays:2},[],new Date('2027-03-13T17:00:00Z'));
    const spring=days.get(Math.floor(Date.parse('2027-03-14T00:00:00Z')/86400000))!;
    expect(spring.offsetAtStart).toBe(-5*3600000);expect(spring.transitions).toEqual([{atMs:Date.parse('2027-03-14T07:00:00Z'),offsetMs:-4*3600000}]);
  });
  it('never opens an earlier hour when an availability boundary falls in a spring DST gap',()=>{
    const settings={...DEFAULT_SCHEDULING,maximumAdvanceDays:1,weekendsEnabled:true,weekly:{...DEFAULT_SCHEDULING.weekly,0:{enabled:true,periods:[{start:150,end:240}]}}};
    const permits=permitMap(settings,[],new Date('2027-03-13T17:00:00Z'));
    const bit=(iso:string)=>{const g=Math.floor(Date.parse(iso)/300000);return permits.get(utcDay(g))?.[g%288]??'0';};
    expect(bit('2027-03-14T06:30:00Z')).toBe('0');expect(bit('2027-03-14T07:00:00Z')).toBe('1');expect(bit('2027-03-14T08:00:00Z')).toBe('0');
  });
  it('limits both occurrences of a fall-back hour to the actual configured local window',()=>{
    const settings={...DEFAULT_SCHEDULING,maximumAdvanceDays:1,weekendsEnabled:true,weekly:{...DEFAULT_SCHEDULING.weekly,0:{enabled:true,periods:[{start:60,end:90}]}}};
    const permits=permitMap(settings,[],new Date('2026-10-31T17:00:00Z'));
    const bit=(iso:string)=>{const g=Math.floor(Date.parse(iso)/300000);return permits.get(utcDay(g))?.[g%288]??'0';};
    expect(bit('2026-11-01T05:00:00Z')).toBe('1');expect(bit('2026-11-01T06:00:00Z')).toBe('1');expect(bit('2026-11-01T05:40:00Z')).toBe('0');expect(bit('2026-11-01T06:40:00Z')).toBe('0');
  });
  it('preserves the chosen instant when editing a second-fold lesson',()=>{
    const secondFold=new Date('2026-11-01T06:30:00Z');const starts=recurringStarts(secondFold,1,1,'America/New_York');expect(starts[0]!.getTime()).toBe(secondFold.getTime());
  });
  it('splits overnight hours onto the next local day, including Saturday to Sunday',()=>{
    const weekly={...DEFAULT_SCHEDULING.weekly,6:{enabled:true,periods:[{start:1320,end:120}]},0:{enabled:false,periods:[]}};
    const normalized=normalizeWeekly(weekly);
    expect(normalized[6].periods).toEqual([{start:1320,end:1440}]);expect(normalized[0]).toEqual({enabled:true,periods:[{start:0,end:120}]});
  });
  it('subtracts a blocked window without reopening weekly breaks',()=>{
    const scheduling={...DEFAULT_SCHEDULING,weekly:{...DEFAULT_SCHEDULING.weekly,1:{enabled:true,periods:[{start:540,end:720},{start:780,end:1020}]}}};
    expect(resolvePeriodsForDate('2027-02-01',scheduling,[{id:'break',date:'2027-02-01',kind:'subtract',periods:[{start:600,end:660}],reason:''}])).toEqual([{start:540,end:600},{start:660,end:720},{start:780,end:1020}]);
  });
  it('covers prep, travel, and cross-midnight intervals with original UTC grain IDs',()=>{
    const grains=intervalGrains(new Date('2027-01-01T23:45:00Z'),60,10,15);
    expect(grains).toHaveLength(17);expect(new Set(grains.map(utcDay)).size).toBe(2);
  });
  it('keeps recurring lessons at 4pm local across spring daylight saving',()=>{
    const starts=recurringStarts(zonedTimeToUtc('2027-03-07',960,'America/New_York'),3,1,'America/New_York');
    expect(starts.map(d=>minutesOfDayIn(d,'America/New_York'))).toEqual([960,960,960]);
    expect(starts[1]!.getTime()-starts[0]!.getTime()).toBe(167*3600000);
  });
  it('rejects nonexistent local times rather than shifting a recurring lesson',()=>{
    expect(()=>recurringStarts(zonedTimeToUtc('2027-03-07',150,'America/New_York'),2,1,'America/New_York')).toThrow(/does not exist/);
  });
  it('retains local time over fall daylight saving',()=>{
    const starts=recurringStarts(zonedTimeToUtc('2026-10-25',960,'America/New_York'),3,1,'America/New_York');
    expect(starts[1]!.getTime()-starts[0]!.getTime()).toBe(169*3600000);
    expect(starts.map(d=>minutesOfDayIn(d,'America/New_York'))).toEqual([960,960,960]);
  });
  it('materializes closed dates and overrides into public permit bitmaps',()=>{
    const settings={...DEFAULT_SCHEDULING,maximumAdvanceDays:2,weekendsEnabled:true,weekly:Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,{enabled:true,periods:[{start:540,end:1020}]}])) as typeof DEFAULT_SCHEDULING.weekly};
    const now=new Date('2027-02-01T17:00:00Z'),blocked='2027-02-02';
    const permits=permitMap(settings,[{id:'block',date:blocked,kind:'blockAll',periods:[],reason:''}],now);
    const openGrain=Math.floor(zonedTimeToUtc('2027-02-01',600,settings.timezone).getTime()/300000);
    const closedGrain=Math.floor(zonedTimeToUtc(blocked,600,settings.timezone).getTime()/300000);
    expect(permits.get(utcDay(openGrain))?.[openGrain%288]).toBe('1');
    expect(permits.get(utcDay(closedGrain))?.[closedGrain%288]??'0').toBe('0');
    expect(setBits(EMPTY_DAY,[0,287],'1').split('').filter(b=>b==='1')).toHaveLength(2);
    expect(toDateKey(zonedTimeToUtc(blocked,600,settings.timezone),settings.timezone)).toBe(blocked);
  });
});
describe('private CRM and money',()=>{
  const a={id:'a',...blankStudent,childName:'Sam',email:'Parent@Example.com',phone:'(786) 555-1234'};
  it('does not merge siblings sharing a parent contact',()=>{expect(contactMatches({studentName:'Alex',email:'parent@example.com',phone:'7865551234'},[a])).toEqual([]);});
  it('normalizes exact contacts and exposes ambiguous matches',()=>{expect(contactMatches({studentName:' Sam ',email:'parent@example.com',phone:''},[a,{...a,id:'b'}])).toHaveLength(2);});
  it('does not match on a common child name alone',()=>{expect(contactMatches({studentName:'Sam',email:'',phone:''},[a])).toHaveLength(0);});
  it('sums only the matching session payments in integer cents',()=>{expect(paidFor('x',[{id:'1',bookingId:'x',studentId:'a',amount:2500,method:'Cash',date:'',note:''},{id:'2',bookingId:'y',studentId:'a',amount:1000,method:'Cash',date:'',note:''}])).toBe(2500);});
});
describe('owner reminder policy',()=>{
  const now=Date.parse('2027-01-04T17:00:00Z'),settings={enabled:true,timezone:'America/New_York',leads:'1440,60',daily:true,dailyHour:7,changes:true,weekly:true,weeklyDay:1,unpaid:false,quietStart:22,quietEnd:7};
  const b={id:'a',studentName:'Sample',subject:'Math',startAt:Timestamp.fromMillis(now+30*60000),endAt:Timestamp.fromMillis(now+90*60000),createdAt:Timestamp.fromMillis(now-60000),status:'confirmed',durationMinutes:60};
  const plan=()=>notificationPlan({now,lastRun:now-3*3600000,settings,bookings:[b],details:[],payments:[],requests:[]});
  it('catches reminders after a delayed cron run and has deterministic idempotency keys',()=>{const first=plan(),second=plan();expect(first).toEqual(second);expect(first.some((e:{key:string})=>e.key.endsWith('-60'))).toBe(true);});
  it('recognizes overnight quiet hours in the configured timezone',()=>{expect(isQuiet(Date.parse('2027-01-05T04:00:00Z'),settings)).toBe(true);expect(isQuiet(now,settings)).toBe(false);});
  it('does not remind for sessions already started',()=>{expect(notificationPlan({now:now+3600000,lastRun:now,settings:{...settings,daily:false,changes:false,weekly:false},bookings:[b],details:[],payments:[],requests:[]})).toEqual([]);});
  it('never plans parent/student recipients',()=>{expect(plan().every((e:object)=>!('to'in e)&&!('email'in e))).toBe(true);});
});
