const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('./progression');
test('levels unlock sequentially, persist, and never regress on replay',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(_,v)=>value=v};
 const p=create(storage);assert.equal(p.unlocked,1);assert.equal(p.canPlay(2),false);
 assert.equal(p.complete(4),1);assert.equal(p.complete(1),2);assert.equal(create(storage).unlocked,2);
 p.complete(2);p.complete(1);assert.equal(p.unlocked,3);p.complete(3);p.complete(4);p.complete(5);assert.equal(p.unlocked,5);
});
test('invalid or unavailable storage falls back to first level without blocking play',()=>{
 for(const value of ['NaN','99','0','2.5'])assert.equal(create({getItem:()=>value}).unlocked,1);
 const p=create({getItem(){throw Error();},setItem(){throw Error();}});assert.equal(p.complete(1),2);
});
