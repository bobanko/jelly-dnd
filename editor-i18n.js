/* Translate editor presentation only. Map data and editable input values stay untouched. */
import {i18n as JellyI18n,createTextTranslator} from './i18n.js';
import {editorMessages} from './locales/editor/index.js';

export let editorI18n=null;

export function initEditorI18n(){
 const translate=createTextTranslator(key=>JellyI18n.t(key),editorMessages.ru);
 const textRecords=new WeakMap(),attributeRecords=new WeakMap();
 function localizeValue(node,attribute){
  const value=attribute?node.getAttribute(attribute):node.textContent;if(value===null)return;
  let records=attribute?attributeRecords.get(node):textRecords.get(node);
  if(!records){records={};(attribute?attributeRecords:textRecords).set(node,records);}
  const key=attribute||'text',previous=records[key];
  const source=previous&&value===previous.result?previous.source:value,result=translate(source);
  records[key]={source,result};
  if(value!==result){if(attribute)node.setAttribute(attribute,result);else node.textContent=result;}
 }
 function apply(root=document.documentElement){
  if(!JellyI18n)return;
  if(root.nodeType===Node.TEXT_NODE){if(!root.parentElement?.closest('script,style,textarea,[data-level-name]'))localizeValue(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE||root.closest('script,style,textarea,[data-level-name]'))return;
  for(const attr of ['title','aria-label','placeholder'])localizeValue(root,attr);
  for(const child of root.childNodes)apply(child);
 }
 const switcher=document.createElement('div');switcher.className='editor-languages';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Language');
 for(const [code,name] of [['en','English'],['ru','Русский']]){const button=document.createElement('button');button.type='button';button.dataset.language=code;button.textContent=code.toUpperCase();button.setAttribute('aria-label',name);switcher.append(button);}
 document.querySelector('.actions').prepend(switcher);
 addEventListener('languagechange',()=>apply());
 const observer=new MutationObserver(changes=>{
  observer.disconnect();
  for(const change of changes){if(change.type==='childList')change.addedNodes.forEach(node=>apply(node));else apply(change.target);}
  observe();
 });
 function observe(){observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});}
 observe();document.addEventListener('DOMContentLoaded',()=>apply(),{once:true});
 return editorI18n={apply,translate,source:(node,attribute)=>attributeRecords.get(node)?.[attribute]?.source??node.getAttribute(attribute)};
}
