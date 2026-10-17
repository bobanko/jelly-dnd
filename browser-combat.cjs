const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000');await page.waitForFunction(()=>sceneRenderer.ready);
  await page.evaluate(()=>{
   window.combatEvents=[];const burst=effects.burst.bind(effects);effects.burst=(event,...rest)=>{combatEvents.push(event);burst(event,...rest);};
   focusPlayer(1);camera.x=9;camera.z=7;zoom=1.25;resize();
  });
  await page.waitForTimeout(400);await page.screenshot({path:'artifacts/archer-and-shield-pickup.png'});
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(()=>players[1].shield==='oak-shield');await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(()=>world.pickups[0].holder===1&&players[1].facingX===-1&&players[1].facingZ===0));
  await page.screenshot({path:'artifacts/shield-equipped.png'});
  // Undo restores the actual pickup as well as the character inventory and facing.
  await page.keyboard.press('KeyZ');
  assert.ok(await page.evaluate(()=>players[1].shield===null&&world.pickups[0].holder===null));
  await page.keyboard.down('ArrowLeft');await page.waitForFunction(()=>players[1].shield);await page.keyboard.up('ArrowLeft');
  // Input is camera-relative; the shield must use the resulting world direction.
  await page.evaluate(()=>{angle=targetAngle=Math.PI/2;});
  await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>players[1].facingZ===-1);await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(()=>players[1].facingX),0);
  await page.evaluate(()=>{
   angle=targetAngle=0;stopInput();Object.assign(players[1],{x:10,z:7,y:0,rx:10,rz:7,facingX:0,facingZ:-1});soft.reset();
   world.arrows=[];world.archers[0].cooldown=.7;combatEvents.length=0;camera.x=10;camera.z=6.8;zoom=1.5;resize();
  });
  await page.waitForFunction(()=>combatEvents.some(e=>e.type==='arrowBlock'),null,{timeout:7000});
  assert.equal(await page.evaluate(()=>players[1].state),'alive');
  assert.ok(await page.evaluate(()=>effects.particles.some(p=>p.kind==='magic')));
  await page.screenshot({path:'artifacts/shield-blocking-arrow.png'});
  // The same shot is lethal when the carrier exposes its back.
  await page.evaluate(()=>{players[1].facingZ=1;world.arrows=[];world.archers[0].cooldown=.2;combatEvents.length=0;});
  await page.waitForFunction(()=>players[1].state==='dead'&&players[1].deathReason==='arrow',null,{timeout:7000});
  assert.ok(await page.evaluate(()=>effects.particles.some(p=>p.kind==='jelly')&&world.pickups[0].holder===null&&players[1].shield===null));
  await page.screenshot({path:'artifacts/arrow-death.png'});
  await page.waitForFunction(()=>players[1].state==='alive',null,{timeout:7000});
  assert.equal(await page.evaluate(()=>players[1].deaths),1);
  await page.keyboard.press('KeyR');
  assert.ok(await page.evaluate(()=>world.arrows.length===0&&world.pickups[0].holder===null&&players.every(p=>p.shield===null&&p.facingX===0&&p.facingZ===1)));
  assert.deepEqual(await page.evaluate(()=>sceneRenderer.errors),[]);assert.deepEqual(errors,[]);
  console.log('PASS: archer geometry, automatic shield pickup, front-face equipment, camera-relative facing, frontal arrow block and sparks, back-hit death and respawn, inventory undo/reset. No browser or GPU validation errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
