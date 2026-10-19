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
  assert.deepEqual(errors,[]);console.log('PASS inline XYZ, colour radios, precise torch/spike erase, block preservation and undo/redo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
