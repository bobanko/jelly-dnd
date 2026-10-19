const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000/');await page.waitForFunction(()=>sceneRenderer.ready);await page.waitForTimeout(300);
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await page.locator('#play').textContent(),'Play');
 const before=await page.evaluate(()=>players.map(p=>[p.x,p.z]));await page.keyboard.press('w');await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.x,p.z])),before);
 await page.screenshot({path:'artifacts/menu-en.png'});
 await page.locator('[data-language=ru]').click();assert.equal(await page.locator('#play').textContent(),'Играть');
 await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'ru');
 await page.locator('[data-language=en]').click();await page.locator('#play').click();assert.equal(await page.locator('#main-menu').isVisible(),false);
 await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');assert.ok(await page.evaluate(()=>moves>0));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#play').textContent(),'Resume');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/menu-mobile.png'});assert.equal(await page.locator('#play').isVisible(),true);
 await page.goto('http://localhost:3000/?level=editor');assert.equal(await page.locator('#main-menu').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS menu, paused input, languages, persistence, resume, mobile and editor launch');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
