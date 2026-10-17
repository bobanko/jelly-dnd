const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>model.map.conveyors.length===3);
  await page.locator('#view-grid').click();
  await page.locator('[data-tool=conveyor]').click();await page.selectOption('#belt-direction','1,0');
  await page.locator('#belt-speed').fill('1.1');await page.selectOption('#brush-shape','rectangle');
  const point=async(x,z)=>page.evaluate(([x,z])=>{const m=metrics();return {x:m.rect.left+m.x+(x+.5)*m.cell,y:m.rect.top+m.y+(z+.5)*m.cell};},[x,z]);
  const a=await point(11,12),b=await point(14,12);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>model.map.conveyors.length),7);
  assert.ok(await page.evaluate(()=>model.map.conveyors.filter(p=>p.z===12).every(p=>p.dx===1&&p.dz===0&&p.speed===1.1)));
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.conveyors.length),3);await page.locator('#redo').click();
  await page.locator('[data-tool=select]').click();const p=await point(12,12);await page.mouse.click(p.x,p.y);
  await page.getByLabel('Направление ленты',{exact:true}).selectOption('0,-1');assert.equal(await page.evaluate(()=>model.at('conveyors',12,12).dz),-1);
  await page.getByLabel('Направление ленты',{exact:true}).selectOption('1,0');
  const speed=page.getByLabel('Скорость ленты, кл/с',{exact:true});await speed.fill('1.25');await speed.press('Tab');
  assert.equal(await page.evaluate(()=>model.at('conveyors',12,12).speed),1.25);
  const data=await page.evaluate(()=>model.map);await page.reload();await page.waitForFunction(()=>model.map.conveyors.length===7);assert.deepEqual(await page.evaluate(()=>model.map),data);
  await page.locator('#view-3d').click();await page.waitForFunction(()=>previewRenderer?.ready&&previewRuntime);
  await page.evaluate(()=>{previewCamera.x=12.5;previewCamera.z=12;previewZoom=2.5;});
  await page.waitForTimeout(250);await page.screenshot({path:'artifacts/conveyor-editor-3d.png'});
  assert.ok(await page.evaluate(()=>previewRuntime.world.conveyorJoined(previewRuntime.world.conveyors[3],1)));
  assert.deepEqual(await page.evaluate(()=>previewRenderer.errors),[]);
  // The custom room exercises continuous transport, crates and player input in the actual game.
  await page.evaluate(()=>{
   const map=L.blank();map.name='Conveyor chamber';map.size=8;
   for(let x=1;x<=6;x++)for(let z=1;z<=6;z++)map.tiles.push({x,z,height:0});
   map.spawns=[{x:1,z:3},{x:1,z:4},{x:5,z:6}];map.goals=[{x:2,z:1},{x:4,z:1},{x:6,z:1}];map.crates=[{x:2,z:5}];
   for(const z of [3,4,5])for(let x=1;x<=6;x++)map.conveyors.push({x,z,dx:1,dz:0,speed:1});
   replaceMap(map);
  });
  await page.locator('#play').click();await page.waitForURL('**/?level=editor');await page.waitForFunction(()=>sceneRenderer.ready);
  await page.waitForFunction(()=>players[0].x>2.3&&players[1].x>2.3&&crates[0].x>3.2,null,{timeout:10000});
  assert.ok(await page.evaluate(()=>players.slice(0,2).every(p=>p.state==='alive'&&p.vx>.75&&p.vx<1.2)&&crates[0].state==='alive'&&Math.abs(players[2].x-5)<.05));
  const before=await page.evaluate(()=>players[0].x);await page.keyboard.down('KeyA');await page.waitForTimeout(450);await page.keyboard.up('KeyA');
  assert.ok(await page.evaluate(x=>players[0].x<x-.12,before));
  await page.keyboard.press('KeyZ');assert.ok(await page.evaluate(x=>Math.abs(players[0].x-x)<.15,before));
  await page.waitForFunction(()=>players[0].vx>.6);
  await page.evaluate(()=>{zoom=1.55;resize();});await page.screenshot({path:'artifacts/conveyor-playtest.png'});
  await page.keyboard.press('KeyR');assert.ok(await page.evaluate(()=>players[0].x<1.1&&crates[0].x<2.1&&world.conveyors.length===18));
  assert.deepEqual(await page.evaluate(()=>sceneRenderer.errors),[]);assert.deepEqual(errors,[]);
  await page.locator('#editor-link').click();await page.waitForURL('**/editor.html');assert.equal(await page.evaluate(()=>model.map.conveyors.length),18);
  console.log('PASS: conveyor brush/rectangle, direction and speed, undo/redo and draft roundtrip, connected 3D belt geometry/WGSL, automatic jelly and crate transport, countersteering, movement undo and reset. No browser or GPU errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
