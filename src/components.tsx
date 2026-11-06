import {useEffect,useRef,type ReactNode} from 'react';
import {X,ArrowUpRight,CalendarDays} from 'lucide-react';
import type {Lesson,Preferences} from './model';
import {ms} from './model';
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();const previous=document.activeElement as HTMLElement;return()=>{el?.close();previous?.focus();};},[]);
  return <dialog ref={ref} className={wide?'modal wide':'modal'} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><header><div><span className="eyebrow">YOUR WORKSPACE</span><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={20}/></button></header>{children}</dialog>;
}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Empty({title,body,action}:{title:string;body:string;action?:ReactNode}){return <div className="empty"><span className="empty-icon"><CalendarDays size={26}/></span><h3>{title}</h3><p>{body}</p>{action}</div>;}
export function Badge({status}:{status:string}){return <span className={`badge ${status}`}>{({noShow:'No-show',cancelled:'Canceled'} as Record<string,string>)[status]??status}</span>;}
export function timeLabel(timestamp:unknown,zone:string,prefs:Preferences){return new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:prefs.timeFormat==='12'}).format(ms(timestamp));}
export function LessonRow({lesson,zone,prefs,onClick,price,color}:{lesson:Lesson;zone:string;prefs:Preferences;onClick:()=>void;price?:string;color?:string}){return <button className="lesson-row" onClick={onClick}><time>{timeLabel(lesson.startAt,zone,prefs)}<small>{lesson.durationMinutes} min</small></time><span className="lesson-stripe" style={{background:color??'#739788'}}/><span className="lesson-person"><strong>{lesson.studentName}</strong><small>{lesson.subject||'Tutoring session'}</small></span><Badge status={lesson.status}/>{price&&<span className="row-price">{price}</span>}<ArrowUpRight size={17}/></button>;}
export function DownloadButton({label,filename,content,type='text/csv'}:{label:string;filename:string;content:()=>string;type?:string}){return <button className="button secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([content()],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>{label}</button>;}
