import {chromium} from './browser-harness.js';
import fs from 'node:fs';
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000');await page.waitForFunction(()=>sceneRenderer.ready,null,{timeout:30000});
  await page.waitForFunction(()=>bodies.every(p=>soft.get(p).sleeping),null,{timeout:20000});
  await page.evaluate(()=>{
   globalThis.perfTotals={};globalThis.perfOriginal={step:world.step,props:sceneRenderer.props,render:sceneRenderer.render};
   for(const [object,key,label] of [[world,'step','physics'],[sceneRenderer,'props','props'],[sceneRenderer,'render','render']]){
    const original=object[key];object[key]=function(...args){const start=performance.now(),result=original.apply(this,args),total=perfTotals[label];if(total){total.ms+=performance.now()-start;total.count++;}return result;};
   }
  });
  const results=[];
  const measure=async name=>{
   await page.waitForTimeout(250);
   await page.evaluate(()=>{perfTotals={physics:{ms:0,count:0},props:{ms:0,count:0},render:{ms:0,count:0}};globalThis.perfStart=performance.now();});
   await page.waitForTimeout(2500);
   const result=await page.evaluate(()=>{const seconds=(performance.now()-perfStart)/1000,p=perfTotals;return {seconds,fps:p.render.count/seconds,physicsMsPerFrame:p.physics.ms/p.render.count,propsMsPerFrame:p.props.ms/p.render.count,renderMsPerFrame:p.render.ms/p.render.count,stepsPerFrame:p.physics.count/p.render.count,sleep:bodies.map(p=>soft.get(p).sleeping)};});
   results.push({name,...result});console.log(JSON.stringify(results.at(-1)));
  };
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await measure('three-jellies-and-crate-idle');
  const {profile}=await cdp.send('Profiler.stop');
  const hits=new Map();for(const node of profile.nodes){const name=node.callFrame.functionName||'(anonymous)';hits.set(name,(hits.get(name)||0)+(node.hitCount||0));}
  const hotFunctions=[...hits].sort((a,b)=>b[1]-a[1]).slice(0,20);console.log('CPU self samples:',JSON.stringify(hotFunctions));
  await page.evaluate(()=>{players[2].state='dead';players[2].respawnTimer=1e6;});await measure('two-jellies-and-crate-idle');
  await page.evaluate(()=>{players[2].state='alive';globalThis.perfProps=sceneRenderer.props;sceneRenderer.props=()=>0;});await measure('three-jellies-without-prop-generation');
  await page.evaluate(()=>{sceneRenderer.props=perfProps;won=true;});await measure('three-jellies-without-simulation');
  await page.evaluate(()=>{won=false;globalThis.pokeTimer=setInterval(()=>soft.poke(players[0]),350);});await measure('one-jelly-awake');
  await page.evaluate(()=>clearInterval(pokeTimer));
  fs.writeFileSync('artifacts/performance-'+(process.env.PERF_LABEL||'current')+'.json',JSON.stringify({results,hotFunctions,errors,gpuErrors:await page.evaluate(()=>sceneRenderer.errors)},null,2));
  if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
