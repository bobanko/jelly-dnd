const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const viewport of [{width:960,height:640},{width:1280,height:800},{width:390,height:844},{width:1280,height:480}])for(const language of ['en','ru']){
   await page.setViewportSize(viewport);await page.goto('http://localhost:3000/');await page.waitForFunction(()=>typeof sceneRenderer!=='undefined'&&sceneRenderer.ready&&!loadingActive);
   await page.locator('[data-language='+language+']').click();
   await page.evaluate(()=>{showMenuScreen('levels');const list=document.querySelector('.level-list'),first=list.querySelector('button');for(let i=0;i<35;i++){const button=first.cloneNode(true);button.removeAttribute('data-level');button.disabled=false;button.textContent='Extra level '+(i+1);list.append(button);}selectMenuItem(0);});
   const geometry=()=>page.evaluate(()=>Object.fromEntries(['menu-title','levels-back','main-menu'].map(id=>{const n=document.getElementById(id),r=n.getBoundingClientRect();return [id,{top:r.top,bottom:r.bottom,scroll:n.scrollTop}];})));
   const before=await geometry();for(const id of ['menu-title','levels-back'])assert.ok(before[id].top>=0&&before[id].bottom<=viewport.height,id+' fits '+JSON.stringify(viewport));
   const list=page.locator('.level-list'),box=await list.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,700);
   await page.waitForFunction(()=>document.querySelector('.level-list').scrollTop>0);
   assert.deepEqual(await geometry(),before);
   await page.evaluate(()=>selectMenuItem(menuButtons().length-2));
   assert.ok(await page.evaluate(()=>{const n=document.activeElement.getBoundingClientRect(),r=document.querySelector('.level-list').getBoundingClientRect();return n.top>=r.top-1&&n.bottom<=r.bottom+1;}));
   await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'levels-back');assert.deepEqual(await geometry(),before);
   if(viewport.width===960)await page.screenshot({path:'artifacts/level-scroll-'+language+'.png'});
   await page.keyboard.press('q');assert.ok(await page.locator('#menu-root').isVisible());
  }
  assert.deepEqual(errors,[]);console.log('PASS level-only wheel and keyboard scrolling with fixed title/back at four sizes in EN/RU');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
