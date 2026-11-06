/** Explicit account scope. The original public booking app leaves this at null. */
import {doc as rawDoc,collection as rawCollection} from 'firebase/firestore';
let tenant:string|null=null;
export function setWorkspace(uid:string|null){tenant=uid;}
export function isIntegrated(){return tenant===null;}
export function workspacePath(path:string){return tenant?`workspaces/${tenant}/${path}`:path;}
type RefFactory=(parent:any,...segments:string[])=>any;
export const doc:typeof rawDoc=((parent:any,...segments:string[])=>(rawDoc as RefFactory)(parent,...(parent.type==='firestore'?[workspacePath(segments.join('/'))]:segments))) as typeof rawDoc;
export const collection:typeof rawCollection=((parent:any,...segments:string[])=>(rawCollection as RefFactory)(parent,...(parent.type==='firestore'?[workspacePath(segments.join('/'))]:segments))) as typeof rawCollection;
