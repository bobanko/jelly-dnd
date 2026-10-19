const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>typeof model!=='undefined'&&typeof previewRenderer!=='undefined'&&previewRenderer.ready);
  await page.evaluate(()=>{const map=L.blank();map.size=8;map.blocks=[{x:3,y:0,z:3},{x:3,y:1,z:3}];map.torches=[{x:3,y:1,z:3,face:'south'}];map.spikes=[{x:3,y:1,z:3,offset:0}];map.spawns=[{x:1,y:0,z:1},null,null,null];model.load(map);selected={x:3,y:1,z:3};changed();fit();});
  const row=await page.locator('.coordinate-placement>label').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...row)-Math.min(...row)<2);
  const props=await page.locator('[data-object="blocks-1"] .coordinate-field').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.equal(props.length,3);assert.ok(Math.max(...props)-Math.min(...props)<2);
  const radio=page.locator('[data-object="blocks-1"] input[type=radio][value="2"]');await radio.check();assert.equal(await page.evaluate(()=>model.map.blocks[1].color),2);assert.equal(await page.locator('[data-object="blocks-1"] select').count(),0);
  await page.screenshot({path:'artifacts/editor-compact.png'});
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.blocks[1].color),undefined);
  const clickWorld=async p=>{const q=await page.evaluate(p=>{const r=$('viewport').getBoundingClientRect(),q=JellyGPU.projectPoint(screenFrame(),...p,r.width,r.height);return {x:r.left+q.x,y:r.top+q.y};},p);await page.mouse.click(q.x,q.y);};
  await page.locator('[data-tool=erase]').click();
  const torchPoint=await page.evaluate(()=>{const f=L.torchFrame(model.map.torches[0]);return f.origin.map((v,k)=>v+f.n[k]*.25+(k===1?.2:0));});
  await clickWorld(torchPoint);assert.equal(await page.evaluate(()=>model.map.torches.length),0);assert.equal(await page.evaluate(()=>model.map.blocks.length),2);assert.equal(await page.evaluate(()=>model.map.spikes.length),1);
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.torches.length),1);await page.locator('#redo').click();
  await clickWorld([3.21,1.15,3.21]);assert.equal(await page.evaluate(()=>model.map.spikes.length),0);assert.equal(await page.evaluate(()=>model.map.blocks.length),2);
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.spikes.length),1);
  const map=await page.evaluate(()=>{const map=L.blank();map.size=8;for(let x=1;x<=6;x++)for(let z=1;z<=6;z++)map.blocks.push({x,y:0,z});map.spawns=[{x:2,y:0,z:2},{x:5,y:0,z:2},null,null];map.goals=[{x:2,y:0,z:3},{x:5,y:0,z:3},null,null];map.portals=[{x:2,y:0,z:4,color:'violet'},{x:5,y:0,z:4,color:'violet'}];return map;});
  await page.locator('#file').setInputFiles({name:'my-original-level.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(map))});await page.waitForFunction(()=>sourceFilename==='my-original-level.json');
  await page.evaluate(()=>{selected={x:2,y:0,z:4};renderProperties();});await page.locator('[data-object="portals-0"] input[type=radio][value="amber"]').check();assert.equal(await page.evaluate(()=>model.map.portals[0].color),'amber');
  await page.evaluate(()=>{selected={x:2,y:0,z:2};renderProperties();});await page.locator('[data-object="spawns-0"] input[type=radio][value="1"]').click();assert.equal(await page.evaluate(()=>model.map.spawns[1].x),2);assert.equal(await page.evaluate(()=>model.map.spawns[0].x),5);
  await page.evaluate(()=>{selected={x:2,y:0,z:3};renderProperties();});await page.locator('[data-object="goals-0"] input[type=radio][value="3"]').click();assert.equal(await page.evaluate(()=>model.map.goals[3].x),2);assert.equal(await page.evaluate(()=>model.map.goals[0]),null);
  await page.evaluate(()=>{model.change(map=>{map.drones=[{x:3,y:0,z:3,color:0,target:-1,hover:1}];map.plates=[{x:3,y:0,z:3,id:'test',color:'red'}];map.spikes=[{x:3,y:0,z:3,offset:0}];});selected={x:3,y:0,z:3};changed();});
  for(const [key,value] of [['drones','2'],['plates','amber'],['spikes','1']]){
   await page.locator(`[data-object="${key}-0"] input[name="color-${key}-0"][value="${value}"]`).check();
   assert.equal(await page.evaluate(key=>model.map[key][0].color,key),key==='plates'?value:Number(value));
  }
  await page.locator('[data-object="spikes-0"] input[type=radio][value=""]').check();assert.equal(await page.evaluate(()=>model.map.spikes[0].color),undefined);
  await page.locator('input[name="target-drones-0"][value="1"]').check();assert.equal(await page.evaluate(()=>model.map.drones[0].target),1);
  assert.equal(await page.locator('input[name="color-drones-0"]:checked').inputValue(),'2');
  await page.locator('input[name="target-drones-0"][value="-1"]').check();assert.equal(await page.evaluate(()=>model.map.drones[0].target),-1);
  assert.equal(await page.locator('#properties select[aria-label*="Цвет"]').count(),0);
  await page.locator('[data-tool=spikes]').click();await page.locator('#spike-brush input[type=radio][value="3"]').check();assert.equal(await page.evaluate(()=>spikeColor.value),'3');
  const swatch=await page.locator('#spike-brush .color-swatch').first().boundingBox();assert.ok(swatch.width>=27&&swatch.height>=27);
  await page.screenshot({path:'artifacts/editor-colors.png'});
  await page.locator('#level-name').fill('A different title');await page.locator('#level-name').press('Tab');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);assert.equal(download.suggestedFilename(),'my-original-level.json');
  await page.reload();await page.waitForFunction(()=>typeof model!=='undefined');assert.equal(await page.evaluate(()=>sourceFilename),'my-original-level.json');
  const [again]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);assert.equal(again.suggestedFilename(),'my-original-level.json');
  assert.deepEqual(errors,[]);console.log('PASS inline XYZ, colour radios, precise torch/spike erase, block preservation and undo/redo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
