import {describe,it,expect} from 'vitest';
import {Timestamp} from 'firebase/firestore';
import {findConflicts} from '../../conflicts';
import {DEFAULT_SCHEDULING} from '../../services/defaults';
import type {Lesson,Detail} from '../../model';
const b=(id:string,start:string,end:string)=>({id,studentName:'Sample',status:'confirmed',startAt:Timestamp.fromDate(new Date(start)),endAt:Timestamp.fromDate(new Date(end)),durationMinutes:60,beforeBuffer:0,afterBuffer:15} as Lesson);
const now=Date.parse('2027-02-01T12:00:00Z');
const schedule={...DEFAULT_SCHEDULING,weekly:{...DEFAULT_SCHEDULING.weekly,1:{enabled:true,periods:[{start:540,end:1020}]}}};
describe('visible scheduling diagnostics',()=>{
 it('flags a newly blocked lesson while preserving the original record',()=>{const booking=b('a','2027-02-01T15:00:00Z','2027-02-01T16:00:00Z');const result=findConflicts([booking],schedule,[{id:'closed',date:'2027-02-01',kind:'blockAll',periods:[],reason:''}],[],now);expect(result[0]?.lesson).toBe(booking);expect(result[0]?.reason).toMatch(/Outside/);});
 it('honors explicit owner availability exceptions',()=>{const booking=b('a','2027-02-01T23:00:00Z','2027-02-02T00:00:00Z');expect(findConflicts([booking],schedule,[],[{id:'a',availabilityOverride:true} as Detail],now)).toEqual([]);});
 it('flags both lessons in a buffer overlap even if availability overrides are allowed',()=>{const lessons=[b('a','2027-02-01T15:00:00Z','2027-02-01T16:00:00Z'),b('b','2027-02-01T16:00:00Z','2027-02-01T17:00:00Z')];const result=findConflicts(lessons,schedule,[],[{id:'a',availabilityOverride:true},{id:'b',availabilityOverride:true}] as Detail[],now);expect(result).toHaveLength(2);expect(result.every(c=>c.reason.includes('Overlaps'))).toBe(true);});
});
