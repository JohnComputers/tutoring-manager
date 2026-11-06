/** Optional visual QA: npm install --no-save --no-package-lock @playwright/test */
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('qa',{recursive:true});
try{
  await page.goto(process.env.QA_URL??'http://127.0.0.1:5178/tutoring-manager/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('heading',{name:'Welcome back, John.'}).waitFor({timeout:60000});
  await page.screenshot({path:'qa/login-desktop.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Desktop layout overflows.');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'qa/login-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile layout overflows.');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Desktop/mobile login layout and browser runtime passed.');
}finally{await browser.close();}
