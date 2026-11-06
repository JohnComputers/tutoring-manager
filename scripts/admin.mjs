import {applicationDefault,cert,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createRequire} from 'node:module';
/** Production Actions accepts a service-account secret. Optional local CLI auth never writes credentials. */
export async function adminDatabase(){
  if(process.env.USE_FIREBASE_CLI_AUTH==='1'&&!process.env.FIREBASE_SERVICE_ACCOUNT){
    const require=createRequire(import.meta.url);
    const firebaseAuth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/api');
    const account=firebaseAuth.getGlobalDefaultAccount();
    if(!account?.tokens?.refresh_token)throw new Error('No local Firebase CLI login is available.');
    const {Firestore}=await import('@google-cloud/firestore');
    return new Firestore({projectId:process.env.FIREBASE_PROJECT_ID??'johns-tutoring',preferRest:true,credentials:{type:'authorized_user',client_id:api.clientId(),client_secret:api.clientSecret(),refresh_token:account.tokens.refresh_token}});
  }
  if(!getApps().length){
    let credential;
    if(process.env.FIREBASE_SERVICE_ACCOUNT)credential=cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    else credential=applicationDefault();
    initializeApp({credential,projectId:process.env.FIREBASE_PROJECT_ID??'johns-tutoring'});
  }
  const database=getFirestore();database.settings({preferRest:true});return database;
}
