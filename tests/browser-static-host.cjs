// Exercise a static HTTPS deployment in a cross-origin iframe, without server.js.
const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const staticRoot=path.resolve(process.env.STATIC_GAME_ROOT||path.join(__dirname,'..'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1040,height:720}}),errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://portal.test/**',route=>route.fulfill({contentType:'text/html',body:'<iframe name="game" src="https://static-game.test/html/123/index.html" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads" allow="autoplay; fullscreen" style="width:960px;height:640px;border:0"></iframe>'}));
  const scripts=new Set(['index.html','editor.html','style.css','editor.css','controls.css']);
  for(const html of ['index.html','editor.html'])for(const match of fs.readFileSync(path.join(staticRoot,html),'utf8').matchAll(/(?:src|data-entry)="([^"]+\.js)"/g))scripts.add(match[1]);
  for(const script of scripts)if(script.endsWith('.js')){
   for(const match of fs.readFileSync(path.join(staticRoot,script),'utf8').matchAll(/^import\s+(?:[^'"\n]+\s+from\s+)?['"](\.[^'"]+)['"]/gm))
    scripts.add(path.posix.normalize(path.posix.join(path.posix.dirname(script),match[1])));
  }
  await page.route('https://static-game.test/**',async route=>{
   const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname).replace(/^\/html\/123\//,'');
   const allowed=scripts.has(relative)||/^levels\/[a-z0-9-]+\.json$/i.test(relative)||/^assets\/materials\/[a-z0-9-]+\.png$/i.test(relative);
   const file=path.resolve(staticRoot,relative);
   if(!allowed||!file.startsWith(staticRoot+path.sep)||!fs.existsSync(file)){missing.push(relative);return route.fulfill({status:404,body:'Not found'});}
   return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png'}[path.extname(file)]});
  });
  await page.goto('https://portal.test/');const frame=page.frame({name:'game'});
  await frame.waitForFunction(()=>typeof sceneRenderer!=='undefined'&&(sceneRenderer.ready||loadingFailed));
  assert.equal(await frame.evaluate(()=>loadingFailed),false,await frame.locator('#loading-status').textContent());
  await frame.waitForFunction(()=>!loadingActive);await frame.locator('#play').click();await frame.locator('[data-level="1"]').click();
  await frame.waitForFunction(()=>typeof sceneRenderer!=='undefined'&&sceneRenderer.ready&&!loadingActive);
  assert.equal(await frame.evaluate(()=>definition.name),'First Steps');const before=await frame.evaluate(()=>players[0].z);
  await frame.locator('#menu-button').focus();await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');assert.ok(await frame.evaluate(()=>players[0].z)<before);
  await page.keyboard.press('Escape');await frame.locator('#open-editor').click();await frame.waitForFunction(()=>typeof model!=='undefined'&&typeof previewRenderer!=='undefined'&&previewRenderer.ready);assert.equal(await frame.evaluate(()=>model.map.name),'The Sunken Sanctum');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS static HTTPS subdirectory + cross-origin sandbox iframe, WebGPU without unsafe flag, JSON, textures, menu, level launch, input and editor. No Node server or API used.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
