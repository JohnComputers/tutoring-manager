import {spawnSync} from 'node:child_process';
for(const args of [['node_modules/vitest/vitest.mjs','run','--config','vitest.rules.config.ts','--silent'],...(process.env.RUN_UI_QA==='true'?[['scripts/ui-smoke.mjs']]:[])]){
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status??1);
}
