import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,KEY,LEGACY_KEY} from '../progression.js';
function store(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
const order=['a.json','b.json','c.json','d.json','e.json'];
function progress(storage,files=order){const p=create(storage);p.configure(files);return p;}
test('levels unlock sequentially, persist, and never regress on replay',()=>{
 const storage=store(),p=progress(storage);assert.equal(p.unlocked,1);assert.equal(p.canPlay(2),false);
 assert.equal(p.complete(4),1);assert.equal(p.complete(1),2);assert.equal(progress(storage).unlocked,2);
 p.complete(2);p.complete(1);assert.equal(p.unlocked,3);p.complete(3);p.complete(4);p.complete(5);assert.equal(p.unlocked,5);
});
test('reordering and inserting maps preserves unlocked file identities and uses the new next level',()=>{
 const storage=store(),p=progress(storage);p.complete(1);p.complete(2);
 const changed=progress(storage,['new.json','c.json','a.json','d.json','b.json','e.json']);
 assert.equal(changed.canPlay(1),true);assert.equal(changed.canPlay(2),true);assert.equal(changed.canPlay(3),true);assert.equal(changed.canPlay(5),true);
 assert.equal(changed.canPlay(4),true);assert.equal(changed.canPlay(6),true);
 const renamed=progress(storage,['new.json','renamed.json']);assert.equal(renamed.canPlay(2),false);
});
test('numeric saves migrate by historical file identity even after reordering',()=>{
 const storage=store({[LEGACY_KEY]:'2'}),p=progress(storage,['03-true-colors.json','02-helping-hands.json','01-first-steps.json','new.json']);
 assert.equal(p.canPlay(2),true);assert.equal(p.canPlay(3),true);assert.equal(p.canPlay(4),true);assert.equal(JSON.parse(storage.getItem(KEY)).version,2);
});
test('invalid or unavailable storage falls back to the first level without blocking play',()=>{
 for(const value of ['NaN','99','0','2.5'])assert.equal(progress(store({[LEGACY_KEY]:value})).unlocked,1);
 const p=progress({getItem(){throw Error();},setItem(){throw Error();}});assert.equal(p.complete(1),2);
});

test('best times persist by map identity and only improve on valid completion',()=>{
 const storage=store(),p=progress(storage);
 p.complete(2,1);assert.equal(p.bestTime(2),null);
 p.complete(1,12.34);p.complete(1,20);p.complete(1,NaN);p.complete(1,-1);
 assert.equal(p.bestTime(1),12.34);p.complete(1,10);
 const reordered=progress(storage,['b.json','a.json']);assert.equal(reordered.bestTime(2),10);assert.equal(reordered.bestTime(1),null);
});
