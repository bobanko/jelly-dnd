import {messages} from './locales/index.js';

export let i18n=null;

export function initI18n(){
 let language='en';try{const saved=localStorage.getItem('jelly-dnd.language');if(Object.hasOwn(messages,saved))language=saved;}catch{}
 const t=key=>messages[language]?.[key]??messages.en[key]??key;
 const records=[];
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const node=walker.currentNode,key=node.textContent.trim();if(Object.hasOwn(messages.en,key))records.push({node,key,prefix:node.textContent.match(/^\s*/)[0],suffix:node.textContent.match(/\s*$/)[0]});}
 document.querySelectorAll('[aria-label],[title]').forEach(node=>{for(const attr of ['aria-label','title']){const key=node.getAttribute(attr);if(Object.hasOwn(messages.en,key))records.push({node,attr,key});}});
 function apply(){document.documentElement.lang=language;records.forEach(r=>{const value=t(r.key);if(r.attr)r.node.setAttribute(r.attr,value);else r.node.textContent=r.prefix+value+r.suffix;});document.querySelectorAll('[data-t]').forEach(n=>n.textContent=t(n.dataset.t));document.querySelectorAll('[data-language]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.language===language)));globalThis.dispatchEvent(new Event('languagechange'));}
 document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{if(!Object.hasOwn(messages,button.dataset.language))return;language=button.dataset.language;try{localStorage.setItem('jelly-dnd.language',language);}catch{}apply();}));
 apply();return i18n={t,messages,get language(){return language;}};
}
