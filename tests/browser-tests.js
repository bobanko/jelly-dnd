import {chromium} from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000');
  await page.waitForFunction(()=>sceneRenderer.ready,null,{timeout:30000});
  await page.waitForFunction(()=>players.every(p=>soft.get(p).sleeping),null,{timeout:15000});
  assert.ok(await page.evaluate(()=>sceneRenderer.stoneTexture.mipLevelCount>1&&sceneRenderer.woodTexture.mipLevelCount>1),'stone and wood textures must load with mipmaps');
  await page.screenshot({path:'artifacts/dungeon-webgpu.png'});
  assert.ok((await page.locator('aside').boundingBox()).height<155,'party panel should be compact');
  assert.equal(await page.locator('.hint,.camera-help,.footnote,.jelly-settings small,.intro p').count(),0);
  // Both projections share follow/picking geometry; pitch and FOV are real camera controls.
  await page.locator('.jelly-settings summary').click();
  assert.equal(await page.locator('#camera-mode').inputValue(),'perspective');
  assert.equal(await page.locator('.camera-settings legend').textContent(),'Камера');
  assert.equal(await page.locator('#camera-mode option:checked').textContent(),'Перспективная');
  assert.equal(await page.locator('#camera-pitch-value').textContent(),'55°');
  await page.screenshot({path:'artifacts/camera-perspective-settings.png'});
  await page.selectOption('#camera-mode','ortho');
  assert.equal(await page.locator('#camera-fov').isDisabled(),true);
  assert.equal(await page.locator('#camera-pitch').inputValue(),'30');
  await page.waitForFunction(()=>sceneRenderer.cameraState?.perspective===false);
  await page.screenshot({path:'artifacts/camera-orthographic-settings.png'});
  await page.locator('#camera-pitch').evaluate(el=>{el.value='63';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>Math.abs(sceneRenderer.cameraState.view[1]-Math.sin(63*Math.PI/180))<.0001);
  await page.selectOption('#camera-mode','perspective');
  assert.equal(await page.locator('#camera-pitch').inputValue(),'55');
  assert.equal(await page.locator('#camera-fov').isDisabled(),false);
  await page.locator('#camera-pitch').evaluate(el=>{el.value='68';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>Math.abs(sceneRenderer.cameraState.view[1]-Math.sin(68*Math.PI/180))<.0001);
  const cubeScaleBeforeFov=await page.evaluate(()=>project(players[0].x,.42+players[0].y,players[0].z).scale);
  await page.locator('#camera-fov').evaluate(el=>{el.value='72';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>sceneRenderer.cameraState.perspective&&camera.fov===72&&Math.abs(sceneRenderer.cameraState.view[1]-Math.sin(68*Math.PI/180))<.0001);
  assert.ok(await page.evaluate(before=>Math.abs(project(players[0].x,.42+players[0].y,players[0].z).scale-before)<.02,cubeScaleBeforeFov),'FOV must preserve the followed cube size');
  await page.screenshot({path:'artifacts/camera-steep-wide-fov.png'});
  // Arrow keys adjust a focused slider without moving the blue character.
  await page.locator('#camera-pitch').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>heldKeys.size),0);
  assert.equal(await page.locator('#camera-pitch').inputValue(),'69');
  await page.selectOption('#camera-mode','ortho');assert.equal(await page.locator('#camera-pitch').inputValue(),'63');
  await page.locator('#camera-pitch').evaluate(el=>{el.value='30';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.selectOption('#camera-mode','perspective');
  await page.locator('#camera-pitch').evaluate(el=>{el.value='55';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#camera-fov').evaluate(el=>{el.value='45';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('.jelly-settings summary').click();
  await page.locator('#sound svg').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
  await page.locator('#sound svg').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#sound svg').count(),1);
  const initial=await page.evaluate(()=>players[0].z);
  await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'ц',code:'KeyW'})));
  await page.waitForTimeout(220);
  await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW'})));
  assert.ok(await page.evaluate(start=>players[0].z<start-.08,initial),'Russian-layout movement failed');
  await page.keyboard.press('KeyZ');
  for(let i=1;i<=4;i++){await page.keyboard.press('KeyE');await page.waitForTimeout(300);await page.screenshot({path:`artifacts/camera-${i%4}.png`});}
  await page.evaluate(()=>{
   reset();Object.assign(players[0],{x:2,z:7,rx:2,rz:7});Object.assign(players[1],{x:2.82,z:7,rx:2.82,rz:7});soft.reset();camera.x=2.3;camera.z=7;zoom=1.65;resize();
  });
  await page.waitForTimeout(600);
  const before=await page.evaluate(()=>players[1].x);
  await page.keyboard.down('KeyD');await page.waitForTimeout(620);await page.keyboard.up('KeyD');
  assert.ok(await page.evaluate(before=>players[1].x>before+.08,before),'Soft-body pushing failed');
  await page.waitForTimeout(1800);
  await page.screenshot({path:'artifacts/candy-contact.png'});
  const pokePoint=await page.evaluate(()=>project(players[0].x,.42+players[0].y,players[0].z));
  const movesBeforePoke=await page.evaluate(()=>moves);
  await page.mouse.click(pokePoint.x,pokePoint.y);
  assert.equal(await page.evaluate(()=>moves),movesBeforePoke+1,'perspective picking must match rendered jelly');
  await page.waitForTimeout(60);
  await page.screenshot({path:'artifacts/candy-poke.png'});
  await page.evaluate(()=>sceneRenderer.mesh=true);await page.waitForTimeout(100);
  await page.screenshot({path:'artifacts/tetrahedral-lattice.png'});
  await page.evaluate(()=>sceneRenderer.mesh=false);
  // Arrange overlapping screen footprints to exercise both refraction layers.
  await page.evaluate(()=>{
   reset();Object.assign(players[0],{x:2.3,z:6.5,rx:2.3,rz:6.5});Object.assign(players[1],{x:3.1,z:7.3,rx:3.1,rz:7.3});soft.reset();camera.x=2.5;camera.z=6.7;zoom=1.8;resize();
  });
  await page.waitForTimeout(600);await page.screenshot({path:'artifacts/layered-refraction.png'});
  await page.evaluate(()=>{reset();players[0].x=3.4;players[0].rx=3.4;soft.reset();zoom=1;resize();});
  await page.keyboard.down('KeyD');
  await page.waitForFunction(()=>players[0].state==='falling',null,{timeout:8000});
  await page.keyboard.up('KeyD');await page.waitForTimeout(120);
  await page.screenshot({path:'artifacts/falling-cube.png'});
  await page.waitForFunction(()=>players[0].state==='dead'&&effects.particles.some(p=>p.kind==='jelly'),null,{timeout:8000});
  await page.screenshot({path:'artifacts/void-death-effect.png'});
  await page.waitForFunction(()=>players[0].deaths>0&&players[0].state==='alive',null,{timeout:8000});
  assert.equal(await page.evaluate(()=>effects.particles.length),0);
  assert.ok(await page.evaluate(()=>players[0].x<3&&Math.abs(players[0].y)<.1));
  // Board the lift through normal held-key movement and step onto the upper floor.
  await page.evaluate(()=>{reset();Object.assign(players[0],{x:4.1,z:7,rx:4.1,rz:7});soft.reset();camera.x=4.1;camera.z=7;zoom=1.4;resize();});
  await page.keyboard.down('KeyD');await page.waitForFunction(()=>players[0].x>4.95);await page.keyboard.up('KeyD');
  await page.waitForFunction(()=>world.lifts[0].height>.99&&players[0].y>.85,null,{timeout:8000});
  await page.screenshot({path:'artifacts/lift-raised.png'});
  await page.keyboard.down('KeyS');await page.waitForFunction(()=>players[0].z>7.85);await page.keyboard.up('KeyS');
  await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>players[0].y>.85&&players[0].state==='alive'));
  await page.screenshot({path:'artifacts/upper-platform.png'});
  await page.waitForFunction(()=>world.lifts[0].height<.01,null,{timeout:6000});
  // Walk onto the short floor spikes, then verify independent respawn.
  await page.evaluate(()=>{reset();Object.assign(players[0],{x:2.2,z:9,rx:2.2,rz:9});soft.reset();camera.x=2.2;camera.z=9;});
  await page.keyboard.down('KeyD');await page.waitForFunction(()=>players[0].state==='dead'&&players[0].deathReason==='spikes');await page.keyboard.up('KeyD');
  assert.ok(await page.evaluate(()=>effects.particles.some(p=>p.kind==='jelly')),'spike death should emit jelly scraps');
  await page.screenshot({path:'artifacts/floor-spikes.png'});
  await page.waitForFunction(()=>players[0].state==='alive'&&players[0].deaths===1,null,{timeout:5000});
  assert.equal(await page.evaluate(()=>players[1].deaths),0);
  assert.equal(await page.evaluate(()=>effects.particles.length),0);
  // Isolate the trap crossing from the demo belt immediately south of it.
  // Cross while the first trap is fully hidden, then observe its warning and rise.
  await page.evaluate(()=>{
   reset();world.conveyors=[];world.featureTime=2.35;Object.assign(players[0],{x:3,z:9.9,rx:3,rz:9.9});soft.reset();camera.x=3;camera.z=9;zoom=1.6;resize();
  });
  await page.waitForTimeout(70);assert.equal(await page.evaluate(()=>world.spikeState(world.spikes[0]).extension),0);
  await page.screenshot({path:'artifacts/spikes-hidden.png'});
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>players[0].z<8.25);await page.keyboard.up('KeyW');
  assert.ok(await page.evaluate(()=>players[0].state==='alive'&&players[0].deaths===0));
  assert.equal(await page.evaluate(()=>world.debugBoxes().some(b=>b.kind==='spikes'&&b.x===3&&b.z===9)),false);
  await page.waitForFunction(()=>{const s=world.spikeState(world.spikes[0]);return s.stage==='peeking'&&s.extension===.3;},null,{timeout:10000});
  assert.equal(await page.evaluate(()=>world.spikeState(world.spikes[0]).dangerous),false);
  assert.equal(await page.evaluate(()=>sceneRenderer.propPieces.some(p=>p.kind==='indicator')),false);
  await page.screenshot({path:'artifacts/spikes-warning.png'});
  await page.waitForFunction(()=>{const state=world.spikeState(world.spikes[0]);return state.stage==='rising'&&state.extension>.1&&state.extension<.9;},null,{timeout:10000});
  await page.screenshot({path:'artifacts/spikes-rising.png'});
  await page.waitForFunction(()=>world.spikeState(world.spikes[0]).stage==='raised');
  assert.ok(await page.evaluate(()=>players[0].state==='alive'&&players[0].deaths===0));
  await page.keyboard.press('KeyZ');assert.equal(await page.evaluate(()=>world.spikeState(world.spikes[0]).extension),0);
  await page.keyboard.press('KeyR');assert.equal(await page.evaluate(()=>world.spikeState(world.spikes[0]).extension),1);
  // Portal glow grows continuously before the teleport trigger is reached.
  await page.evaluate(()=>{reset();Object.assign(players[0],{x:3,z:5.15,rx:3,rz:5.15});soft.reset();camera.x=3;camera.z=5.6;zoom=1.7;resize();});
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>world.portalCharge(world.portals[0],players)),0);
  await page.screenshot({path:'artifacts/portal-idle-rings.png'});
  await page.keyboard.down('KeyS');await page.waitForFunction(()=>players[0].z>5.34);await page.keyboard.up('KeyS');await page.waitForTimeout(180);
  assert.ok(await page.evaluate(()=>{const charge=world.portalCharge(world.portals[0],players);return charge>0&&charge<1&&players[0].portalLock===null;}));
  await page.screenshot({path:'artifacts/portal-charging.png'});
  // Same-colour portal traversal changes floor height and stays at the exit.
  await page.evaluate(()=>{reset();Object.assign(players[0],{x:3,z:5.4,rx:3,rz:5.4});soft.reset();camera.x=3;camera.z=5.4;zoom=1.5;resize();});
  await page.keyboard.down('KeyS');await page.waitForFunction(()=>players[0].portalLock==='violet'&&players[0].x>5.5&&players[0].y>.85);await page.keyboard.up('KeyS');
  assert.equal(await page.evaluate(()=>effects.rings.length),2);
  await page.screenshot({path:'artifacts/teleport-effect.png'});
  await page.waitForTimeout(1000);assert.ok(await page.evaluate(()=>players[0].x>5.5&&players[0].y>.8&&players[0].state==='alive'));
  assert.equal(await page.evaluate(()=>effects.rings.length+effects.particles.length),0);
  assert.ok(await page.evaluate(()=>world.portalInactive(world.portals[1],players)&&world.portalInactive(world.portals[0],players)&&world.portalCharge(world.portals[1],players)===0));
  await page.screenshot({path:'artifacts/paired-portals.png'});
  await page.screenshot({path:'artifacts/portal-inactive-arrival.png'});
  await page.evaluate(()=>soft.translate(players[0],0,0,-.7,true));
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>world.portalInactive(world.portals[1],players)),true,'partly leaving must keep the portal inactive');
  await page.evaluate(()=>soft.translate(players[0],0,0,-.2,true));
  await page.waitForFunction(()=>players[0].portalLock===null&&!world.portalInactive(world.portals[1],players));
  await page.waitForTimeout(180);await page.screenshot({path:'artifacts/portal-reactivated.png'});
  await page.locator('.jelly-settings summary').click();await page.locator('#colliders').check();
  assert.equal(await page.evaluate(()=>sceneRenderer.colliders),true);await page.waitForTimeout(120);
  await page.screenshot({path:'artifacts/level-colliders.png'});
  await page.locator('#colliders').uncheck();await page.locator('.jelly-settings summary').click();
  // The third refraction layer and physical red-player keys work independently.
  await page.evaluate(()=>reset());await page.keyboard.press('Digit3');
  assert.equal(await page.evaluate(()=>followedPlayer),2);
  const redX=await page.evaluate(()=>players[2].x);
  await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'д',code:'KeyL'})));
  await page.waitForFunction(x=>players[2].x>x+.1,redX);
  await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keyup',{key:'l',code:'KeyL'})));
  assert.ok(await page.evaluate(x=>players[2].x>x+.08,redX));
  // A falling cube lands on its companion and rides with the moving lower body.
  await page.evaluate(()=>{
   reset();Object.assign(players[0],{x:2,z:7,rx:2,rz:7});Object.assign(players[1],{x:2,z:7,y:2.3,rx:2,rz:7,state:'falling'});soft.reset();camera.x=2;camera.z=7;zoom=1.8;resize();
  });
  await page.waitForFunction(()=>players[1].state==='alive'&&soft.get(players[1]).support===players[0],null,{timeout:8000});
  await page.waitForTimeout(450);await page.screenshot({path:'artifacts/jelly-stack.png'});
  await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>players[0].x>2.6&&Math.abs(players[1].x-players[0].x)<.16&&players[1].y-players[0].y>.65));
  await page.screenshot({path:'artifacts/jelly-passenger.png'});
  // Push the crate over the widened terrace edge and restore it with undo.
  await page.evaluate(()=>{
   reset();Object.assign(players[0],{x:6.1,z:9,y:1,rx:6.1,rz:9,portalLock:'violet'});soft.reset();camera.x=6.1;camera.z=9;zoom=1.65;resize();
  });
  await page.waitForTimeout(400);await page.screenshot({path:'artifacts/wooden-crate-terrace.png'});
  const crateBefore=await page.evaluate(()=>({x:crates[0].x,y:crates[0].y,z:crates[0].z}));
  await page.keyboard.down('KeyD');
  await page.waitForFunction(()=>crates[0].state==='falling'&&Math.abs(soft.get(crates[0]).r[1])>.12,null,{timeout:10000});
  await page.screenshot({path:'artifacts/crate-tumbling.png'});
  await page.waitForFunction(()=>crates[0].x>7.6&&crates[0].y<.7,null,{timeout:10000});await page.keyboard.up('KeyD');
  await page.waitForFunction(()=>crates[0].state==='alive'&&Math.abs(crates[0].y)<.1,null,{timeout:8000});
  await page.screenshot({path:'artifacts/crate-pushed-down.png'});
  await page.keyboard.press('KeyZ');assert.ok(await page.evaluate(before=>Math.abs(crates[0].x-before.x)<.03&&Math.abs(crates[0].z-before.z)<.03&&crates[0].y>.9,crateBefore));
  await page.keyboard.press('KeyR');assert.equal(await page.locator('.member:visible').count(),3);
  // Bridges extend from the bank, support a crossing passenger, then slide back.
  await page.evaluate(()=>{
   reset();Object.assign(players[0],{x:2,z:5,rx:2,rz:5});Object.assign(players[1],{x:8,z:5.1,rx:8,rz:5.1});soft.reset();focusPlayer(1);camera.x=8;camera.z=4.5;zoom=1.7;resize();
  });
  await page.waitForFunction(()=>bridges[0].progress>.2&&bridges[0].progress<.8);
  assert.ok(await page.evaluate(()=>{const b=bridges[0],bounds=world.bridgeBounds(0);return world.heightAt(8,3.55)===0&&world.heightAt(8,3.5+b.progress+.02)===null&&Math.abs(bounds.halfZ*2-b.progress)<1e-9;}));
  await page.screenshot({path:'artifacts/bridge-extending.png'});
  await page.waitForFunction(()=>bridges[0].progress===1,null,{timeout:6000});
  await page.waitForFunction(()=>sceneRenderer.platePress[0]>.95);
  await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>players[1].z<4.15);await page.keyboard.up('ArrowUp');
  assert.equal(await page.evaluate(()=>players[1].state),'alive');
  await page.keyboard.down('KeyS');await page.keyboard.press('Digit2');await page.waitForFunction(()=>players[0].z>5.6);await page.keyboard.up('KeyS');
  await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>bridges[0].progress),1);
  await page.screenshot({path:'artifacts/bridge-crossing.png'});
  await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>players[1].z<3.05);await page.keyboard.up('ArrowUp');
  await page.waitForFunction(()=>bridges[0].progress>.2&&bridges[0].progress<.8);
  await page.screenshot({path:'artifacts/bridge-retracting.png'});
  await page.waitForFunction(()=>bridges[0].progress===0,null,{timeout:6000});
  await page.waitForFunction(()=>sceneRenderer.platePress[0]<.01);
  assert.equal(await page.evaluate(()=>world.debugBoxes().some(b=>b.kind==='bridge')),false);
  await page.keyboard.press('KeyZ');assert.equal(await page.evaluate(()=>bridges[0].progress),1);
  await page.keyboard.press('KeyR');assert.equal(await page.evaluate(()=>bridges[0].progress),0);
  // Show all three distinct rune glyphs before any finish tile activates.
  await page.evaluate(()=>{
   reset();Object.assign(players[1],{x:6,z:2,rx:6,rz:2});soft.reset();focusPlayer(1);camera.x=6;camera.z=2;zoom=1.5;resize();
  });
  await page.waitForTimeout(250);await page.screenshot({path:'artifacts/finish-rune-symbols.png'});
  // Only the matching player lights a finish tile, with no pre-victory beam.
  await page.evaluate(()=>{
   reset();Object.assign(players[0],{...goals[0],rx:goals[0].x,rz:goals[0].z});soft.reset();focusPlayer(0);camera.x=3;camera.z=2;zoom=1.3;resize();
  });
  await page.waitForFunction(()=>sceneRenderer.goalGlowStrength[0]>.95);
  assert.ok(await page.evaluate(()=>!won&&sceneRenderer.goalWinGlow===0&&sceneRenderer.goalGlowStrength.slice(1).every(s=>s===0)));
  await page.screenshot({path:'artifacts/goal-tile-glow.png'});
  await page.waitForFunction(()=>effects.runes.some(p=>p.glyph===0&&p.position[1]>1));
  assert.ok(await page.evaluate(()=>effects.runes.every(p=>p.glyph===0)&&sceneRenderer.runeCount>0));
  await page.screenshot({path:'artifacts/goal-rune-particles.png'});
  await page.evaluate(()=>{soft.translate(players[0],1,0,0,true);});
  await page.waitForFunction(()=>sceneRenderer.goalGlowStrength[0]<.01);
  await page.waitForFunction(()=>effects.runes.length===0);
  // Move only coordinates: copying the goal's colour slot would change identity.
  await page.evaluate(()=>{reset();Object.assign(players[0],{x:goals[1].x,z:goals[1].z,rx:goals[1].x,rz:goals[1].z});soft.reset();});
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>sceneRenderer.goalGlowStrength.every(s=>s===0)),'a different-colour player must not light the rune');
  assert.equal(await page.evaluate(()=>effects.runes.length),0);
  // The blue finish is separate from the bridge button and visibly illuminates.
  await page.evaluate(()=>{
   reset();Object.assign(players[1],{...goals[1],rx:goals[1].x,rz:goals[1].z});soft.reset();focusPlayer(1);camera.x=8;camera.z=3;zoom=1.6;resize();
  });
  await page.waitForFunction(()=>sceneRenderer.goalGlowStrength[1]>.95);
  assert.ok(await page.evaluate(()=>!won&&sceneRenderer.goalWinGlow===0&&!active(1)&&goals[1].z!==plates[1].z));
  assert.ok(await page.evaluate(()=>effects.runes.length>0&&effects.runes.every(p=>p.glyph===1)));
  await page.screenshot({path:'artifacts/blue-finish-tile.png'});
  // Victory keeps animating after simulation stops, widening and brightening all beams.
  await page.evaluate(()=>{
   reset();players.forEach((p,i)=>Object.assign(p,{...goals[i],rx:goals[i].x,rz:goals[i].z}));soft.reset();focusPlayer(1);camera.x=6;camera.z=2;zoom=1.2;resize();
  });
  await page.waitForFunction(()=>won&&sceneRenderer.goalWinGlow>.97&&sceneRenderer.goalGlowStrength.every(s=>s>.97));
  await page.waitForFunction(()=>effects.runes.some(p=>p.age>1));
  assert.deepEqual(await page.evaluate(()=>[...new Set(effects.runes.map(p=>p.glyph))].sort()),[0,1,2]);
  assert.ok(await page.evaluate(()=>effects.runes.length<=32&&effects.runes.some(p=>p.age<.3)));
  assert.ok(await page.locator('#win').isVisible());
  await page.screenshot({path:'artifacts/goal-beams-victory.png'});
  await page.keyboard.press('KeyR');
  assert.ok(await page.evaluate(()=>!won&&sceneRenderer.goalWinGlow===0&&sceneRenderer.goalGlowStrength.every(s=>s===0)));
  assert.equal(await page.evaluate(()=>effects.runes.length),0);
  assert.deepEqual(await page.evaluate(()=>sceneRenderer.errors),[]);
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:'artifacts/mobile-webgpu.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.jelly-settings summary').click();
  await page.screenshot({path:'artifacts/mobile-camera-settings.png'});
  assert.ok(await page.evaluate(()=>{const r=document.querySelector('.jelly-settings').getBoundingClientRect();return r.top>=0&&r.right<=innerWidth&&r.bottom<innerHeight;}));
  const unsupported=await browser.newPage({viewport:{width:1000,height:700}});
  await unsupported.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));
  await unsupported.goto('http://localhost:3000');
  await unsupported.waitForFunction(()=>document.querySelector('#gpu-status').textContent.includes('нет WebGPU'));
  assert.ok(await unsupported.locator('#gpu-fallback').isVisible());await unsupported.screenshot({path:'artifacts/webgpu-unavailable.png'});
  console.log('PASS: WebGPU/WGSL, three player controls and refraction layers, camera, soft-body pushing, poke, lattice overlay, falls and landing, stacked jelly carrying, lift boarding/upper exit/return, crate pushing/drop/undo, smooth bridge extension/crossing/retraction/undo, lethal spikes/respawn, paired height-changing portals, separate blue finish, matching tile illumination/fade and victory beams/reset, level collider toggle, responsive layout and WebGPU fallback. No browser or GPU validation errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
