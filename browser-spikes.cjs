const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>view3d&&previewRenderer?.ready&&previewRuntime);
  await page.evaluate(()=>{const m=L.blank();m.size=8;m.name='Mounted spikes';for(let x=0;x<8;x++)for(let z=0;z<8;z++)m.blocks.push({x,y:0,z});m.blocks.push({x:3,y:1,z:3});m.spawns[1]={x:1,y:0,z:1};m.spawns[2]={x:1,y:0,z:5};m.goals[1]={x:6,y:0,z:1};m.goals[2]={x:6,y:0,z:5};replaceMap(m);Object.assign(previewCamera,{x:3.5,z:3.5,targetY:.3});previewZoom=1.35;});
  const click=async(x,y,z)=>{const p=await page.evaluate(p=>{const r=$('viewport').getBoundingClientRect(),s=JellyGPU.projectPoint(screenFrame(),...p,r.width,r.height);return {x:r.left+s.x,y:r.top+s.y};},[x,y,z]);await page.mouse.click(p.x,p.y);};
  const turn=async angle=>{await page.evaluate(a=>{previewAngle=previewTargetAngle=a;},angle);await page.waitForFunction(f=>previewRenderer.frames>f+1,await page.evaluate(()=>previewRenderer.frames));};
  await page.locator('[data-tool=spikes]').click();await page.selectOption('#spike-color','2');
  for(const [x,y,z,face] of [[3.5,.5,3,'east'],[3,.5,3.5,'south']]){await click(x,y,z);assert.ok(await page.evaluate(face=>model.map.spikes.some(s=>s.face===face&&s.color===2&&s.y===1),face));}
  await turn(Math.PI);
  for(const [x,y,z,face] of [[2.5,.5,3,'west'],[3,.5,2.5,'north']]){await click(x,y,z);assert.ok(await page.evaluate(face=>model.map.spikes.some(s=>s.face===face&&s.color===2&&s.y===1),face));}
  assert.equal(await page.evaluate(()=>model.map.spikes.length),4);
  await turn(0);await page.selectOption('#spike-color','');await click(5,0,4);
  assert.ok(await page.evaluate(()=>model.map.spikes.some(s=>s.x===5&&s.z===4&&s.face===undefined&&s.color===undefined)));
  await page.locator('#properties').getByLabel('Цвет шипов',{exact:true}).selectOption('1');
  await page.locator('#properties').getByLabel('Задержка, сек',{exact:true}).fill('1.2');await page.locator('#properties').getByLabel('Задержка, сек',{exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>model.map.spikes.find(s=>s.x===5).offset),1.2);await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.spikes.find(s=>s.x===5).offset),0);
  await page.locator('[data-tool=select]').click();await click(3,1,3);await page.locator('#properties').getByLabel('Крепление шипов',{exact:true}).first().selectOption('top');assert.ok(await page.evaluate(()=>model.map.spikes.some(s=>s.x===3&&!s.face)));await page.locator('#undo').click();
  await page.locator('[data-tool=spikes]').click();for(const [x,z,color] of [[2,5,''],[4,6,'0'],[5,6,'3']]){await page.selectOption('#spike-color',color);await click(x,0,z);}
  assert.equal(await page.evaluate(()=>model.map.spikes.length),8);assert.deepEqual(await page.evaluate(()=>L.issues(model.map)),[]);
  await page.locator('[data-tool=select]').click();await page.waitForFunction(()=>!previewDirty&&previewRuntime.world.spikes.length===8);assert.equal(await page.evaluate(()=>previewRuntime.world.debugBoxes().filter(b=>b.kind==='spikes').length),32);
  await page.screenshot({path:'artifacts/spikes-mounted-editor.png'});await page.locator('#preview-colliders').check();await page.screenshot({path:'artifacts/spikes-mounted-colliders.png'});await page.locator('#preview-colliders').uncheck();
  await page.evaluate(()=>previewRuntime.world.featureTime=4.8);await page.waitForFunction(f=>previewRenderer.frames>f+1,await page.evaluate(()=>previewRenderer.frames));assert.equal(await page.evaluate(()=>previewRuntime.world.debugBoxes().filter(b=>b.kind==='spikes').length),0);await page.screenshot({path:'artifacts/spikes-mounted-warning.png'});
  await page.evaluate(()=>previewRuntime.world.featureTime=3);await page.waitForFunction(f=>previewRenderer.frames>f+1,await page.evaluate(()=>previewRenderer.frames));await page.screenshot({path:'artifacts/spikes-mounted-hidden.png'});
  const draft=await page.evaluate(()=>JSON.stringify(model.map));await page.reload();await page.waitForFunction(()=>previewRenderer?.ready&&previewRuntime);assert.deepEqual(await page.evaluate(()=>model.map),JSON.parse(draft));
  await page.locator('#play').click();await page.waitForURL('**/?level=editor');await page.waitForFunction(()=>sceneRenderer.ready&&sceneRenderer.frames>3);
  // With a blue/red party, WASD controls blue and arrows control red.
  await page.evaluate(()=>{Object.assign(players[1],{x:1.4,y:0,z:3});world.featureTime=0;soft.reset();});await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>players[1].x>2);await page.waitForTimeout(150);await page.keyboard.up('ArrowRight');assert.ok(await page.evaluate(()=>players[1].state==='alive'&&players[1].deaths===0&&players[1].x<2.2));
  await page.keyboard.press('KeyR');await page.evaluate(()=>{Object.assign(players[0],{x:1.4,y:0,z:3});world.featureTime=0;soft.reset();});await page.keyboard.down('KeyD');await page.waitForFunction(()=>players[0].state==='dead');await page.keyboard.up('KeyD');assert.equal(await page.evaluate(()=>players[0].deathReason),'spikes');assert.ok(await page.evaluate(()=>effects.particles.length>0));await page.waitForFunction(()=>players[0].state==='alive');
  await page.keyboard.press('KeyR');await page.evaluate(()=>{Object.assign(players[0],{x:4,y:0,z:4});world.featureTime=0;soft.reset();});await page.keyboard.down('KeyD');await page.waitForFunction(()=>players[0].x>5.25);await page.keyboard.up('KeyD');assert.ok(await page.evaluate(()=>players[0].state==='alive'&&players[0].deaths===0));
  assert.deepEqual(await page.evaluate(()=>sceneRenderer.errors),[]);assert.deepEqual(errors,[]);
  console.log('PASS: automatic 3D placement on four wall faces and floor, colour/mount/delay inspector edits, undo, neutral and four coloured spikes, warning/debug volumes, persistence/play validation, red immune to red wall spikes, blue killed/respawned and immune to blue floor spikes, no browser/GPU errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
