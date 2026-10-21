const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{if(!localStorage.getItem('jelly-dnd.editor.v1')){const blocks=[];for(let x=1;x<=6;x++)for(let z=1;z<=6;z++)blocks.push({x,y:0,z});localStorage.setItem('jelly-dnd.editor.v1',JSON.stringify({version:1,size:8,name:'Crystal drone test',blocks,spawns:[{x:6,y:0,z:1},{x:6,y:0,z:3}],goals:[{x:6,y:0,z:2},{x:6,y:0,z:6}]}));}});
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>view3d&&previewRenderer?.ready&&previewRenderer.frames>3);
  const click=async(x,y,z)=>{const p=await page.evaluate(p=>{const r=$('viewport').getBoundingClientRect(),s=JellyGPU.projectPoint(screenFrame(),...p,r.width,r.height);return {x:r.left+s.x,y:r.top+s.y};},[x,y,z]);await page.mouse.click(p.x,p.y);};
  await page.locator('[data-tool=drone]').click();await click(1,0,3);assert.equal(await page.evaluate(()=>model.map.drones.length),1);
  await page.locator('#properties').getByLabel('Цвет луча',{exact:true}).selectOption('1');await page.locator('#properties').getByLabel('Цель дрона',{exact:true}).selectOption('1');
  const height=page.locator('#properties').getByLabel('Высота полёта',{exact:true});assert.equal(await height.inputValue(),'0');assert.equal(await height.getAttribute('min'),'0');await height.focus();await height.press('ArrowDown');assert.equal(await height.inputValue(),'0');await height.fill('2.2');await height.press('Tab');await height.focus();await height.press('ArrowUp');assert.equal(await height.inputValue(),'2.3');await height.press('ArrowDown');assert.equal(await height.inputValue(),'2.2');
  await page.locator('[data-tool=select]').click();await page.waitForFunction(()=>!previewDirty&&previewRenderer.beamCount===1);assert.ok(await page.evaluate(()=>previewRuntime.players.every(p=>p.state==='alive')));
  await page.screenshot({path:'artifacts/crystal-drone-editor.png'});
  await page.locator('[data-tool=floor]').click();for(const [axis,value] of [['x',3],['y',2],['z',3]])await page.locator('#coordinate-'+axis).fill(String(value));await page.locator('#place-coordinate').click();
  await page.waitForFunction(()=>!previewDirty&&previewRuntime.world.droneBeams[0]?.hit===-1);assert.ok(await page.evaluate(()=>previewRuntime.world.droneBeams[0].to[0]<3));await page.screenshot({path:'artifacts/crystal-drone-blocked.png'});
  await page.locator('#undo').click();await page.waitForFunction(()=>!previewDirty&&previewRuntime.world.droneBeams[0]?.hit>=0);
  await page.locator('[data-tool=select]').click();const raised=await page.evaluate(()=>previewRuntime.world.droneOrigin(previewRuntime.world.drones[0]));await click(...raised);await height.fill('0');await height.press('Tab');await page.waitForFunction(()=>!previewDirty&&previewRuntime.world.drones[0].hover===0);
  assert.ok(await page.evaluate(()=>Math.abs(previewRuntime.world.droneOrigin(previewRuntime.world.drones[0])[1]-.64)<1e-9&&previewRenderer.crystalPieces.length===1));
  await page.screenshot({path:'artifacts/crystal-drone-low-faceted.png'});
  const draft=await page.evaluate(()=>JSON.stringify(model.map));await page.reload();await page.waitForFunction(()=>previewRenderer?.ready&&previewRenderer.frames>3);assert.deepEqual(await page.evaluate(()=>model.map),JSON.parse(draft));
  const pos=await page.evaluate(()=>previewRuntime.world.droneOrigin(previewRuntime.world.drones[0]));await page.locator('[data-tool=select]').click();await click(...pos);assert.equal(await page.locator('[data-object="drones-0"]').count(),1);
  await page.locator('#play').click();await page.waitForURL('**/?level=editor');await page.waitForFunction(()=>sceneRenderer.ready&&sceneRenderer.frames>6&&sceneRenderer.beamCount===1);
  assert.ok(await page.evaluate(()=>players.every(p=>p.state==='alive'&&p.deaths===0)));assert.equal(await page.evaluate(()=>world.droneBeams[0].target),1);
  assert.ok(await page.evaluate(()=>sceneRenderer.crystalPieces.length===1&&sceneRenderer.crystalPieces[0].count>100));await page.screenshot({path:'artifacts/crystal-drone-game.png'});
  await page.evaluate(()=>{const p=players.find(p=>p.slot===1);p.z=5;soft.reset();});await page.waitForFunction(()=>world.droneBeams[0]?.to[2]>4.5);
  await page.evaluate(()=>{world.drones[0].color=2;});await page.waitForFunction(()=>players.find(p=>p.slot===1).state==='dead');assert.equal(await page.evaluate(()=>players.find(p=>p.slot===1).deathReason),'beam');
  await page.screenshot({path:'artifacts/crystal-drone-hit.png'});await page.evaluate(()=>world.drones[0].color=1);await page.waitForFunction(()=>players.find(p=>p.slot===1).state==='alive');
  await page.keyboard.press('KeyR');assert.ok(await page.evaluate(()=>players.every(p=>p.state==='alive'&&p.deaths===0)&&effects.lasers.length===0));
  assert.deepEqual(await page.evaluate(()=>sceneRenderer.errors),[]);assert.deepEqual(errors,[]);
  console.log('PASS: 3D drone placement and picking, colour/target/hover controls, numeric focus, blocked beam preview, undo, persistence, safe matching colour, live tracking, lethal other colour, fragments/afterglow, respawn/reset and no browser/GPU errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
