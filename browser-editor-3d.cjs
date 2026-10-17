const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>view3d&&previewRenderer?.ready&&previewRuntime);
  assert.ok(await page.locator('#preview').isVisible());assert.equal(await page.evaluate(()=>tool),'select');
  await page.screenshot({path:'artifacts/editor-wysiwyg-default.png'});
  await page.evaluate(()=>{replaceMap(L.blank());model.map.size=8;fit();previewZoom=1.1;});
  const at=async(x,y,z)=>page.evaluate(p=>{const r=document.getElementById('viewport').getBoundingClientRect(),q=JellyGPU.projectPoint(screenFrame(),...p,r.width,r.height);return {x:r.left+q.x,y:r.top+q.y};},[x,y,z]);
  const click=async(x,y,z,options)=>{const p=await at(x,y,z);await page.mouse.click(p.x,p.y,options);};
  const tool=async name=>page.locator(`[data-tool="${name}"]`).click();
  await tool('floor');assert.ok(await page.evaluate(()=>view3d));await click(2,0,2);
  assert.ok(await page.evaluate(()=>!!model.at('tiles',2,2)));
  await page.selectOption('#brush-height','2');await click(2,0,2);
  await page.waitForFunction(()=>previewRuntime.world.heightAt(2,2)===2);
  await tool('crate');await click(2,2,2);await page.waitForFunction(()=>previewRuntime.crates.length===1);
  assert.deepEqual(await page.evaluate(()=>model.map.crates),[{x:2,z:2}]);
  await tool('select');await click(2,2.7,2);assert.deepEqual(await page.evaluate(()=>selected),{x:2,z:2});
  await page.locator('.object-card').filter({hasText:'Ящик'}).getByRole('button',{name:'Перенести'}).click();
  assert.ok(await page.evaluate(()=>view3d));await click(4,2,2);assert.deepEqual(await page.evaluate(()=>model.map.crates),[{x:4,z:2}]);assert.equal(await page.evaluate(()=>model.at('tiles',4,2).height),2);
  // Reframe a blank board, paint a rectangle at a raised construction height.
  await page.evaluate(()=>{replaceMap(L.blank());model.map.size=8;fit();});await tool('floor');await page.selectOption('#brush-height','1');await page.selectOption('#brush-shape','rectangle');
  let a=await at(2,1,2),b=await at(4,1,4);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  assert.equal(await page.evaluate(()=>model.map.tiles.length),9);assert.ok(await page.evaluate(()=>model.map.tiles.every(p=>p.height===1)));
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.tiles.length),0);await page.locator('#redo').click();
  await page.selectOption('#brush-shape','brush');await page.selectOption('#brush-height','2');
  a=await at(2,1,2);b=await at(4,1,2);await page.mouse.move(a.x,a.y);await page.mouse.down();
  await page.waitForFunction(()=>previewRuntime.world.heightAt(2,2)===2); // Updates before mouse-up.
  await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
  assert.ok(await page.evaluate(()=>[2,3,4].every(x=>model.at('tiles',x,2)?.height===2)));
  await page.locator('#undo').click();assert.ok(await page.evaluate(()=>[2,3,4].every(x=>model.at('tiles',x,2)?.height===1)));
  // Orbit changes both azimuth and pitch, without painting or changing history.
  await tool('floor');const before=await page.evaluate(()=>({angle:previewAngle,pitch:previewCamera.pitch,map:JSON.stringify(model.map),history:model.undoStack.length}));
  const r=await page.locator('#viewport').boundingBox();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.6);await page.mouse.down({button:'right'});await page.mouse.move(r.x+r.width*.55+85,r.y+r.height*.6+42,{steps:10});await page.mouse.up({button:'right'});
  assert.ok(await page.evaluate(v=>Math.abs(previewAngle-v.angle)>.5&&previewCamera.pitch>v.pitch+5&&JSON.stringify(model.map)===v.map&&model.undoStack.length===v.history,before));
  await tool('crate');await click(3,1,3);assert.ok(await page.evaluate(()=>!!model.at('crates',3,3)));
  // Middle-button pan follows the projection at the new orbit angle.
  const old=await page.evaluate(()=>({...previewCamera}));await page.mouse.move(r.x+r.width*.45,r.y+r.height*.55);await page.mouse.down({button:'middle'});await page.mouse.move(r.x+r.width*.45+50,r.y+r.height*.55+25,{steps:5});await page.mouse.up({button:'middle'});
  assert.ok(await page.evaluate(v=>Math.hypot(previewCamera.x-v.x,previewCamera.z-v.z)>.3,old));
  await page.selectOption('#editor-projection','perspective');await tool('select');await click(3,1.7,3);assert.deepEqual(await page.evaluate(()=>selected),{x:3,z:3});
  await tool('wall');await click(4,1,4);await page.waitForFunction(()=>previewRuntime.world.obstacles.length===1);
  await tool('select');await click(4.2,2,4.2);assert.deepEqual(await page.evaluate(()=>selected),{x:4,z:4});
  // Erase has its own gesture, leaving right drag exclusively for the camera.
  await page.keyboard.down('Shift');await click(4,2.2,4);await page.keyboard.up('Shift');assert.equal(await page.evaluate(()=>!!model.at('walls',4,4)),false);
  await page.locator('#undo').click();assert.ok(await page.evaluate(()=>!!model.at('walls',4,4)));
  await page.locator('#fit').click();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.4);await page.waitForTimeout(150);
  await page.screenshot({path:'artifacts/editor-wysiwyg-3d.png'});
  assert.deepEqual(await page.evaluate(()=>previewRenderer.errors),[]);assert.deepEqual(errors,[]);
  const draft=await page.evaluate(()=>JSON.stringify(model.map));await page.reload();await page.waitForFunction(()=>view3d&&previewRenderer?.ready&&previewRuntime);assert.equal(await page.evaluate(()=>JSON.stringify(model.map)),draft);
  await page.setViewportSize({width:390,height:844});await tool('conveyor');assert.ok(await page.evaluate(()=>view3d&&document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/editor-wysiwyg-mobile.png'});
  await page.locator('#view-grid').click();assert.ok(await page.locator('#grid').isVisible());
  const unsupported=await browser.newPage();await unsupported.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));await unsupported.goto('http://localhost:3000/editor.html');await unsupported.waitForFunction(()=>!view3d&&!document.getElementById('grid').hidden);assert.ok(await unsupported.locator('#grid').isVisible());await unsupported.close();
  console.log('PASS: default WYSIWYG 3D editing, height-aware selection and placement, live strokes and rectangles, history, moving props, mouse orbit/pan, perspective picking, erase, draft persistence, responsive controls and automatic 2D fallback. No browser or GPU errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
