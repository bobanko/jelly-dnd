const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>view3d&&previewRenderer?.ready&&previewRuntime);
  await page.waitForFunction(t=>cameraLast>t+100,await page.evaluate(()=>cameraLast));
  const original=await page.evaluate(()=>JSON.stringify(model.map));
  await page.locator('#viewport').focus();
  // Physical keys remain language agnostic (Russian layout produces a different key).
  await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',key:'\u044c',bubbles:true})));
  assert.equal(await page.locator('[data-tool=pan]').getAttribute('aria-pressed'),'true');
  const hold=async key=>{await page.keyboard.down(key);await page.waitForTimeout(240);await page.keyboard.up(key);};
  const position=()=>page.evaluate(()=>[previewCamera.x,previewCamera.z]);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const before=await position();await hold('KeyW');const after=await position();assert.ok(distance(before,after)>.3,'W pans in 3D');
  await hold('ArrowRight');assert.ok(distance(after,await position())>.3,'arrow pans in 3D');
  const stopped=await position();await page.waitForTimeout(160);assert.deepEqual(await position(),stopped,'key release stops panning');
  await page.selectOption('#editor-projection','perspective');await page.locator('#viewport').focus();const perspective=await position();await hold('KeyD');assert.ok(distance(perspective,await position())>.3,'perspective panning');
  await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',key:'\u0444',bubbles:true})));
  await page.waitForFunction(()=>panKeys.has('KeyA'));const ru=await position();await page.waitForTimeout(180);assert.ok(distance(ru,await position())>.2,'Russian physical A pans');
  await page.evaluate(()=>dispatchEvent(new Event('blur')));const blurred=await position();await page.waitForTimeout(100);assert.deepEqual(await position(),blurred,'blur clears held keys');
  // Quarter turns animate through intermediate angles rather than jumping.
  const rotation=await page.evaluate(()=>{const start=previewAngle;turnCamera(Math.PI/2);return {start,immediate:previewAngle,target:previewTargetAngle};});
  assert.equal(rotation.immediate,rotation.start);await page.waitForFunction(s=>previewAngle>s+.01&&previewAngle<previewTargetAngle-.01,rotation.start);
  await page.waitForFunction(()=>Math.abs(previewAngle-previewTargetAngle)<.0001);
  await page.locator('#viewport').focus();await page.keyboard.press('KeyQ');await page.waitForFunction(()=>Math.abs(previewAngle-previewTargetAngle)<.0001);
  const r=await page.locator('#viewport').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down({button:'right'});await page.mouse.move(r.x+r.width/2+90,r.y+r.height/2+20);await page.mouse.up({button:'right'});
  await page.waitForFunction(()=>Math.abs(previewAngle-previewTargetAngle)<.0001&&Math.abs(previewCamera.pitch-previewTargetPitch)<.0001);
  assert.equal(await page.evaluate(()=>JSON.stringify(model.map)),original,'camera controls leave level untouched');
  assert.equal(await page.locator('#view-grid, #view-3d, #grid').count(),0);assert.ok(await page.locator('#preview').isVisible());
  // Use real property edits so every key press rebuilds the inspector.
  await page.evaluate(()=>{const m=L.blank();m.blocks=[{x:2,y:0,z:2}];m.conveyors=[{x:2,y:0,z:2,dx:1,dz:0,speed:.85}];m.spikes=[{x:3,y:0,z:3,offset:1.2}];replaceMap(m);selected={x:2,y:0,z:2};renderPanels();});
  const y=page.getByLabel('Y',{exact:true});await y.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');assert.equal(await y.inputValue(),'2');assert.ok(await y.evaluate(e=>e===document.activeElement));
  await page.keyboard.press('ArrowDown');assert.equal(await y.inputValue(),'1');assert.ok(await page.evaluate(()=>!!model.at('blocks',2,2,1)));
  await page.keyboard.press('Tab');assert.equal(await y.evaluate(e=>e===document.activeElement),false,'Tab leaves edited field');
  await page.evaluate(()=>{selected={x:2,y:0,z:2};renderPanels();});
  const speed=page.getByLabel('\u0421\u043a\u043e\u0440\u043e\u0441\u0442\u044c \u043b\u0435\u043d\u0442\u044b, \u043a\u043b/\u0441',{exact:true});
  await speed.focus();await page.keyboard.press('ArrowUp');assert.equal(await speed.inputValue(),'0.95');await page.keyboard.press('ArrowUp');assert.equal(await speed.inputValue(),'1.05');await page.keyboard.press('ArrowDown');assert.equal(await speed.inputValue(),'0.95');assert.ok(await speed.evaluate(e=>e===document.activeElement));
  for(let i=0;i<24;i++)await page.keyboard.press('ArrowDown');assert.equal(await speed.inputValue(),'0.2');assert.ok(await speed.evaluate(e=>e===document.activeElement),'focus retained at minimum');
  const cameraState=await page.evaluate(()=>JSON.stringify([previewCamera,previewTargetAngle,tool]));await page.keyboard.press('KeyW');await page.keyboard.press('KeyM');await page.keyboard.press('KeyQ');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>JSON.stringify([previewCamera,previewTargetAngle,tool])),cameraState,'camera shortcuts ignored in a field');
  await page.evaluate(()=>{selected={x:3,y:0,z:3};renderPanels();});
  const delay=page.getByLabel('\u0417\u0430\u0434\u0435\u0440\u0436\u043a\u0430, \u0441\u0435\u043a',{exact:true});await delay.focus();await page.keyboard.press('ArrowUp');assert.equal(await delay.inputValue(),'1.3');await page.keyboard.press('ArrowDown');assert.equal(await delay.inputValue(),'1.2');assert.ok(await delay.evaluate(e=>e===document.activeElement));
  const coord=page.locator('#coordinate-y');await coord.fill('4');await coord.press('ArrowDown');assert.equal(await coord.inputValue(),'3');assert.ok(await coord.evaluate(e=>e===document.activeElement));
  assert.deepEqual(await page.evaluate(()=>previewRenderer.errors),[]);assert.deepEqual(errors,[]);
  console.log('PASS: 3D-only editor, M pan mode, language-independent WASD/arrows in isometric/perspective views, key release/blur, smooth orbit/quarter turns, unchanged map, integer/fractional steps, repeated inspector edits retain focus, limits and input shortcut isolation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
