const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release;const textureGate=new Promise(r=>release=r);
  await page.route('**/assets/materials/*.png',async route=>{await textureGate;await route.continue();});
  await page.goto('http://localhost:3000/?level=1&play=1');
  await page.waitForFunction(()=>document.querySelector('#loading-progress').value>=.65);
  assert.equal(await page.locator('#gpu-fallback').count(),0);assert.equal(await page.locator('#level-intro-title').textContent(),'First Steps');assert.equal(await page.locator('#level-loading').isVisible(),true);
  await page.keyboard.press('w');assert.equal(await page.evaluate(()=>moves),0);
  await page.screenshot({path:'artifacts/level-loading.png'});release();await page.waitForFunction(()=>sceneRenderer.ready&&!loadingActive);
  assert.equal(await page.locator('#level-intro').isVisible(),false);assert.equal(await page.locator('#level-loading').isVisible(),false);assert.equal(await page.locator('#menu-button').isVisible(),true);
  assert.equal(await page.locator('.jelly-settings').isVisible(),false);
  await page.keyboard.press('Backquote');assert.equal(await page.locator('.jelly-settings').isVisible(),true);assert.equal(await page.locator('.jelly-settings').getAttribute('open'),'');
  const settingsBox=await page.locator('.jelly-settings').boundingBox();assert.ok(settingsBox.x>800&&settingsBox.y<100);
  await page.screenshot({path:'artifacts/developer-settings.png'});
  await page.locator('.jelly-settings summary').click();assert.equal(await page.locator('.jelly-settings').getAttribute('open'),null);
  await page.locator('.jelly-settings summary').click();await page.locator('#softness').focus();await page.keyboard.press('Backquote');assert.equal(await page.locator('.jelly-settings').isVisible(),false);
  await page.keyboard.down('w');await page.waitForTimeout(100);await page.keyboard.up('w');assert.ok(await page.evaluate(()=>moves>0&&players[0].z<start[0].z));
  assert.equal(await page.locator('header').count(),0);assert.equal(await page.locator('.intro').count(),0);assert.equal(await page.locator('aside').count(),0);assert.equal(await page.locator('#menu-button svg').count(),1);
  await page.locator('.player-key-hint').first().waitFor({state:'visible'});assert.equal(await page.locator('.player-key-hint').first().textContent(),'WASD');assert.equal(await page.locator('.player-key-hint').nth(1).textContent(),'↑←↓→');
  await page.screenshot({path:'artifacts/idle-key-hints.png'});
  await page.keyboard.down('w');await page.waitForFunction(()=>playerHints[0].node.hidden);assert.equal(await page.locator('.player-key-hint').nth(1).isVisible(),true);await page.keyboard.up('w');
  assert.equal(await page.locator('#camera-tracking').count(),0);
  const result=await page.evaluate(()=>{
   const place=(positions)=>{players.forEach((p,i)=>{soft.translate(p,positions[i][0]-p.x,0,positions[i][1]-p.z,true);p.rx=p.x;p.rz=p.z;});for(let i=0;i<300;i++)updateGameCamera(1/60);return autoZoom;};
   const near=place([[3,4],[4,4]]),far=place([[1,1],[6,6]]);
   const points=players.map(p=>project(p.x,p.y+.42,p.z));
   const before={x:camera.x,z:camera.z};focusPlayer(1);updateGameCamera(1/60);
   return {near,far,points,drift:Math.hypot(camera.x-before.x,camera.z-before.z)};
  });assert.ok(result.near>result.far);assert.ok(result.drift<.001);assert.ok(result.points.every(p=>p.visible&&p.x>0&&p.x<1280&&p.y>0&&p.y<800));
  await page.keyboard.press('r');await page.waitForFunction(()=>restartTransition===null);await page.waitForTimeout(500);
  await page.screenshot({path:'artifacts/shared-camera.png'});assert.deepEqual(errors,[]);
  await page.locator('#menu-button').click();assert.equal(await page.locator('#main-menu').isVisible(),true);assert.equal(await page.locator('.player-key-hint').first().isVisible(),false);
  const unsupported=await browser.newPage();await unsupported.addInitScript(()=>Object.defineProperty(navigator,'gpu',{get:()=>undefined}));await unsupported.goto('http://localhost:3000/?level=1&play=1');await unsupported.locator('#loading-retry').waitFor({state:'visible'});assert.equal(await unsupported.locator('#level-intro').isVisible(),true);await unsupported.close();
  console.log('PASS loading stages, title overlay, error retry, shared framing, zoom and stable focus');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
