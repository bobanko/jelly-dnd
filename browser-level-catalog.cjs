const {chromium}=require('@playwright/test'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const catalog=structuredClone(require('./levels/catalog.js'));catalog.standard.reverse();
  const first=catalog.standard[0],map=JSON.parse(fs.readFileSync('levels/'+first));map.name='Only in map';map.names={ru:'RU map title'};
  await page.route('**/levels/catalog.js',route=>route.fulfill({contentType:'application/javascript',body:'globalThis.JellyLevelCatalog='+JSON.stringify(catalog)+';'}));await page.route('**/levels/'+first,route=>route.fulfill({json:map}));
  const ready=()=>page.waitForFunction(()=>typeof sceneRenderer!=='undefined'&&sceneRenderer.ready&&!loadingActive);
  await page.goto('http://localhost:3000/');await ready();assert.equal(await page.evaluate(()=>definition.name),'Only in map');await page.locator('#show-levels').click();
  assert.equal(await page.locator('[data-level-name="1"]').textContent(),'Only in map');assert.equal(await page.locator('[data-level="1"]').isEnabled(),true);assert.equal(await page.locator('[data-level="2"]').isDisabled(),true);
  await page.keyboard.press('q');await page.locator('[data-language=ru]').click();await page.locator('#show-levels').click();assert.equal(await page.locator('[data-level-name="1"]').textContent(),'RU map title');
  await page.locator('[data-level="1"]').click();await page.waitForURL('**/?level=1&play=1');await ready();assert.equal(await page.locator('#level-intro-title').textContent(),'RU map title');
  await page.evaluate(()=>{players.forEach(p=>Object.assign(p,goals.find(g=>g.slot===p.slot),{vx:0,vz:0}));soft.reset();finishHold=WIN_HOLD_SECONDS-.01;simulate(.05);});
  assert.equal(await page.locator('#win-level-name').textContent(),'RU map title');await page.locator('#win-next').click();await page.waitForURL('**/?level=2&play=1');await ready();assert.equal(await page.evaluate(()=>definition.name),JSON.parse(fs.readFileSync('levels/'+catalog.standard[1])).name);
  await page.goto('http://localhost:3000/editor.html');await page.waitForFunction(()=>typeof model!=='undefined'&&previewRenderer?.ready);
  assert.equal(await page.locator('#catalog-map option').count(),catalog.standard.length);
  assert.equal(await page.evaluate(()=>sourceFilename),first);
  const next=catalog.standard[1];await page.locator('#catalog-map').selectOption(next);await page.locator('#open-catalog-map').click();
  assert.equal(await page.evaluate(()=>sourceFilename),next);assert.equal(await page.evaluate(()=>model.map.name),JSON.parse(fs.readFileSync('levels/'+next)).name);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);assert.equal(download.suggestedFilename(),next);
  await page.reload();await page.waitForFunction(()=>typeof model!=='undefined');assert.equal(await page.locator('#catalog-map').inputValue(),next);assert.equal(await page.evaluate(()=>sourceFilename),next);
  await page.locator('#catalog-map').selectOption(first);await page.locator('#open-catalog-map').click();assert.equal(await page.evaluate(()=>model.map.name),'Only in map');
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>model.map.name),JSON.parse(fs.readFileSync('levels/'+next)).name);
  assert.deepEqual(errors,[]);console.log('PASS first-map startup, reordered catalog, map titles/translations, locks/next level, editor map picker, filename export, saved draft and undo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
