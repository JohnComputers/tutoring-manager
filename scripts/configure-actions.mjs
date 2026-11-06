/** One-time, owner-authorized setup. Key material goes straight from Google to gh stdin, never disk/logs. */
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {OAuth2Client} from 'google-auth-library';
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/api');
const project='johns-tutoring',repository='JohnComputers/tutoring-manager',accountId='tutoring-manager-reminders';
const email=`${accountId}@${project}.iam.gserviceaccount.com`;
if(process.env.CONFIGURE_ACTIONS_APPLY!=='true'){
  console.log('Dry run: create a dedicated reminder service account with roles/datastore.user, store its key only in this repository Actions secret, and enable verified workspace signup. Set CONFIGURE_ACTIONS_APPLY=true to apply.');
}else{
  let stage='authenticate';
  try{
    const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw new Error('No CLI login.');
    const client=new OAuth2Client(api.clientId(),api.clientSecret());client.setCredentials({refresh_token:account.tokens.refresh_token});
    const iam=`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`;
    stage='service-account';
    try{await client.request({url:`${iam}/${email}`});}catch(e){if(e.response?.status!==404)throw e;await client.request({url:iam,method:'POST',data:{accountId,serviceAccount:{displayName:'Tutoring manager scheduled owner notifications'}}});}
    const policyURL=`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
    stage='least-privilege-role';
    const policy=(await client.request({url:`${policyURL}:getIamPolicy`,method:'POST',data:{options:{requestedPolicyVersion:3}}})).data;
    const member=`serviceAccount:${email}`;
    const binding=policy.bindings.find(b=>b.role==='roles/datastore.user'&&!b.condition);
    if(!binding?.members.includes(member)){
      if(binding)binding.members.push(member);else policy.bindings.push({role:'roles/datastore.user',members:[member]});
      await client.request({url:`${policyURL}:setIamPolicy`,method:'POST',data:{policy}});
    }
    stage='repository-secret';
    const listed=spawnSync('gh',['secret','list','-R',repository,'--json','name'],{encoding:'utf8',shell:false});
    if(listed.status!==0)throw new Error('Could not inspect repository secrets.');
    if(!JSON.parse(listed.stdout).some(s=>s.name==='FIREBASE_SERVICE_ACCOUNT')){
      const key=(await client.request({url:`${iam}/${email}/keys`,method:'POST',data:{privateKeyType:'TYPE_GOOGLE_CREDENTIALS_FILE'}})).data;
      const credential=Buffer.from(key.privateKeyData,'base64').toString('utf8');
      const result=spawnSync('gh',['secret','set','FIREBASE_SERVICE_ACCOUNT','-R',repository],{input:credential,encoding:'utf8',shell:false,stdio:['pipe','pipe','pipe']});
      if(result.status!==0){await client.request({url:`https://iam.googleapis.com/v1/${key.name}`,method:'DELETE'});throw new Error('Failed to save Actions secret; the unused key was revoked.');}
      console.log('Dedicated Firebase service-account key stored directly in GitHub Actions secrets.');
    }else console.log('Existing service-account Actions secret preserved.');
    stage='enable-public-signup';
    await client.request({url:`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=client.permissions.disabledUserSignup`,method:'PATCH',data:{client:{permissions:{disabledUserSignup:false}}}});
    console.log('Firebase signup enabled; private workspace rules protect accounts and preserve owner access.');
  }catch(e){console.error(`Actions setup stopped at ${stage} (${e.response?.status??'local configuration error'}): ${String(e.response?.data?.error?.message??e.message).slice(0,250)}`);process.exitCode=1;}
}
