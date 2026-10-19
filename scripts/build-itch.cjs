'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),files=new Map();
function add(name){
 name=name.replaceAll('\\','/');const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Invalid build file: '+name);
 files.set(name,fs.readFileSync(file));
}
// Explicit entry points and their client scripts/styles; no project-directory copy.
for(const html of ['index.html','editor.html']){
 add(html);
 for(const match of files.get(html).toString().matchAll(/(?:src|href|data-entry)="([^"]+)"/g))
  if(/^[\w./-]+\.(?:js|css|html)$/.test(match[1]))add(match[1]);
}
add('levels/catalog.json');
const catalog=JSON.parse(files.get('levels/catalog.json'));
if(catalog.version!==1||!Array.isArray(catalog.standard)||!catalog.standard.length||new Set(catalog.standard).size!==catalog.standard.length||!catalog.standard.includes(catalog.defaultLevel)||!Array.isArray(catalog.extra))throw Error('Invalid level catalog');
const Levels=require('../levels');
for(const file of [...catalog.standard,...catalog.extra]){
 if(!/^[a-z0-9-]+\.json$/i.test(file))throw Error('Invalid level filename: '+file);
 add('levels/'+file);const map=Levels.read(JSON.parse(files.get('levels/'+file)));
 const errors=Levels.issues(map);if(errors.length)throw Error(file+': '+errors.join('\n'));
}
function assets(folder){for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){const name=folder+'/'+entry.name;if(entry.isDirectory())assets(name);else if(/\.(?:png|jpg|jpeg|webp|gif|svg|ogg|mp3|wav|woff2?|ttf|json)$/i.test(name))add(name);}}
assets('assets');
// Small standard ZIP writer: Node built-ins only, works on Windows/macOS/Linux.
const table=Array.from({length:256},(_,n)=>{for(let bit=0;bit<8;bit++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const now=new Date(),year=Math.max(1980,Math.min(2107,now.getFullYear()));
const date=((year-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
const local=[],central=[];let offset=0;
for(const [name,data] of [...files].sort(([a],[b])=>a.localeCompare(b))){
 const filename=Buffer.from(name),compressed=zlib.deflateRawSync(data,{level:9}),crc=crc32(data);
 if(data.length>0xffffffff||compressed.length>0xffffffff)throw Error('File exceeds ZIP size limit');
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(time,10);header.writeUInt16LE(date,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
 local.push(header,filename,compressed);
 const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(time,12);directory.writeUInt16LE(date,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
 central.push(directory,filename);offset+=header.length+filename.length+compressed.length;
}
if(files.size>65535)throw Error('Too many files for ZIP');
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]);fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
const stamp=parts.year+'-'+parts.month+'-'+parts.day+'_'+parts.hour+'-'+parts.minute+'-'+parts.second;
let output=path.join(root,'dist','jelly-and-bones-itch-'+stamp+'.zip'),suffix=2;
while(fs.existsSync(output))output=path.join(root,'dist','jelly-and-bones-itch-'+stamp+'-'+(suffix++)+'.zip');
fs.writeFileSync(output,archive,{flag:'wx'});
console.log('Built '+path.relative(root,output)+' — '+files.size+' files, '+(archive.length/1024/1024).toFixed(2)+' MiB');
