const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>typeof sceneRenderer!=='undefined'&&sceneRenderer.ready&&!loadingActive);
  async function fits(selector){for(const node of await page.locator(selector).all()){const b=await node.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=961&&b.y+b.height<=641,selector+' outside 960x640');}}
  for(const language of ['en','ru']){
   await page.goto('http://localhost:3000/');await ready();await page.locator('[data-language='+language+']').click();
   assert.equal(await page.locator('#menu-title .title-skull').count(),language==='ru'?2:1);
   assert.ok(await page.locator('#loading-progress').evaluate(node=>parseFloat(getComputedStyle(node).height)>=14));
   await fits('#menu-title,#menu-root button,.menu-key-hints');await page.screenshot({path:'artifacts/menu-960-'+language+'.png'});
   await page.locator('#show-controls').click();assert.equal(await page.locator('#menu-help kbd').count(),25);await fits('#menu-help,#menu-back');await page.screenshot({path:'artifacts/controls-960-'+language+'.png'});await page.keyboard.press('q');
   await page.locator('#show-levels').click();await fits('#menu-title,#menu-levels,#levels-back');await page.screenshot({path:'artifacts/levels-960-'+language+'.png'});
   await page.locator('[data-level="1"]').click();await page.waitForURL('**/?level=1&play=1');await ready();
   await fits('#menu-button,#sound,#fps,footer');await page.locator('.player-key-hint').first().waitFor({state:'visible'});await fits('.player-key-hint');
   assert.ok(await page.evaluate(()=>players.every(p=>{const q=project(p.x,(p.y||0)+.42,p.z);return q.visible&&q.x>0&&q.x<W&&q.y>0&&q.y<H;})));
   await page.screenshot({path:'artifacts/game-960-'+language+'.png'});
   await page.keyboard.press('Backquote');await fits('.jelly-settings');await page.keyboard.press('Backquote');
   await page.evaluate(()=>{players.forEach(p=>Object.assign(p,goals.find(g=>g.slot===p.slot),{vx:0,vz:0}));soft.reset();finishHold=WIN_HOLD_SECONDS-.01;simulate(.05);});
   await fits('.win-panel,#win-title,#win-next,#again');await page.screenshot({path:'artifacts/win-960-'+language+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('PASS 960x640 English/Russian menus, controls, level list, HUD, hints, shared framing, developer panel and victory');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
