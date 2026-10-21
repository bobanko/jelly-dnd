import {chromium as playwrightChromium} from '@playwright/test';
﻿

// Inspect private module state only in tests, without exposing globals in the game.
export function instrumentModule(source,entry){
 if(!['game.js','editor.js'].includes(entry))return source;
 const scope=entry.slice(0,-3);
 return source+'\n;globalThis.__moduleTestScopes??={};globalThis.__moduleTestScopes.'+scope+'=source=>eval(source);\n';
}

function evaluateInModule({source,argument,waiting}){
 const scope=location.pathname.endsWith('/editor.html')?'editor':'game';
 const inspect=globalThis.__moduleTestScopes?.[scope];
 if(!inspect&&waiting)return false;
 const callback=inspect?inspect('('+source+')'):(0,eval)('('+source+')');
 return typeof callback==='function'?callback(argument):callback;
}

const surfaces=new WeakSet();
function inspectSurface(surface){
 if(surfaces.has(surface))return surface;
 surfaces.add(surface);
 const evaluate=surface.evaluate.bind(surface),waitForFunction=surface.waitForFunction.bind(surface);
 surface.evaluate=(callback,argument)=>evaluate(evaluateInModule,{source:String(callback),argument});
 surface.waitForFunction=(callback,argument,options)=>waitForFunction(evaluateInModule,{source:String(callback),argument,waiting:true},options);
 return surface;
}

const pages=new WeakSet();
async function inspectPage(page){
 if(pages.has(page))return page;
 pages.add(page);
 await page.route(/\/(game|editor)\.js(?:\?.*)?$/,async route=>{
  const response=await route.fetch();
  if(!response.ok())return route.fulfill({response});
  const entry=new URL(route.request().url()).pathname.split('/').pop();
  await route.fulfill({response,body:instrumentModule(await response.text(),entry)});
 });
 inspectSurface(page);
 const frame=page.frame.bind(page);
 page.frame=selector=>{const result=frame(selector);return result&&result!==page.mainFrame()?inspectSurface(result):result;};
 return page;
}

export const chromium={
 async launch(options){
  const browser=await playwrightChromium.launch(options);
  const newPage=browser.newPage.bind(browser),newContext=browser.newContext.bind(browser);
  browser.newPage=async options=>inspectPage(await newPage(options));
  browser.newContext=async options=>{
   const context=await newContext(options),newPage=context.newPage.bind(context);
   context.newPage=async()=>inspectPage(await newPage());
   return context;
  };
  return browser;
 }
};
