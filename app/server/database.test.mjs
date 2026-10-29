import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from './database.mjs';

test('daily rediscovery retains favorites, decisions and history; undo makes a card available again',()=>{
 const s=openDatabase(':memory:');try{
  const a=s.upsert('zalando',raw('DAILY-A')),b=s.upsert('zalando',raw('DAILY-B'));
  const liked=randomUUID(),passed=randomUUID();
  s.act({id:liked,productId:a,kind:'like'});s.act({id:passed,productId:b,kind:'pass'});
  const now=new Date();assert.equal(s.list(now).find(p=>p.id===b).seenToday,true);
  const tomorrow=new Date(now.getTime()+86400000);
  const list=s.list(tomorrow);assert.equal(list.find(p=>p.id===b).seenToday,false);
  assert.equal(list.find(p=>p.id===b).decision,'passed');assert.equal(list.find(p=>p.id===a).saved,true);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM events').get().n,2);
  s.act({id:randomUUID(),kind:'undo',reverses:passed});assert.equal(s.list(now).find(p=>p.id===b).seenToday,false);
 }finally{s.close();}
});

test('catalog progress survives category switches, detects repeated pages and resets completed scans on a new day',()=>{
 const s=openDatabase(':memory:');try{
  const url='https://www.zalando.se/herrskor/';
  const result={page:1,totalPages:2,totalCount:3,products:[{id:'A'}],missingCount:1,exhausted:false};
  s.saveCatalogPage('zalando',url,result,'2026-10-29T10:00:00Z');
  assert.equal(s.catalogStart('zalando',url),2);assert.equal(s.catalogStart('zalando','https://www.zalando.se/herrklader/'),1);
  assert.throws(()=>s.saveCatalogPage('zalando',url,{...result,page:2}),/upprepade/);
  assert.equal(s.catalog('zalando',url).next_page,2);
  s.saveCatalogPage('zalando',url,{...result,page:2,products:[{id:'B'}],missingCount:0,exhausted:true},'2026-10-29T10:01:00Z');
  assert.equal(s.catalog('zalando',url).missing_count,1);
  assert.equal(s.catalogStart('zalando',url,'2026-10-30T01:00:00Z'),1);
  s.saveCatalogPage('zalando',url,{...result,missingCount:0},'2026-10-30T01:00:00Z');
  assert.equal(s.catalog('zalando',url).scanned_pages,1);assert.equal(s.catalog('zalando',url).missing_count,0);
 }finally{s.close();}
});

const raw=(id='SKU-A',price=499)=>({id,name:'Fleecejacka',brand:'Testmärke',price,originalPrice:699,currency:'SEK',isSale:true,
  image:'https://img01.ztat.net/test.jpg',url:'https://www.zalando.se/test.html'});
test('imports deduplicate, preserve decisions and retain the price actually shown',()=>{
 const s=openDatabase(':memory:');
 try{
  const id=s.upsert('zalando',raw());const initial=s.list()[0];
  s.upsert('zalando',raw());assert.equal(s.stats().total,1);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM snapshots').get().n,1);
  s.act({id:randomUUID(),productId:id,snapshotId:initial.snapshotId,kind:'like'});
  s.upsert('zalando',raw('SKU-A',399));
  const updated=s.list()[0];assert.equal(updated.priceMinor,39900);assert.equal(updated.saved,true);
  assert.notEqual(updated.snapshotId,initial.snapshotId);
  const event=s.db.prepare('SELECT * FROM events').get();
  const old=JSON.parse(s.db.prepare('SELECT data FROM snapshots WHERE id=?').get(event.snapshot_id).data);
  assert.equal(old.priceMinor,49900);
 }finally{s.close();}
});
test('actions and undo are idempotent and unsaving does not create a dislike',()=>{
 const s=openDatabase(':memory:');try{
  const productId=s.upsert('zalando',raw());const id=randomUUID();
  const action={id,productId,kind:'like'};s.act(action);s.act(action);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
  s.act({id:randomUUID(),productId,kind:'unsave'});
  assert.equal(s.list()[0].decision,'liked');assert.equal(s.list()[0].saved,false);
  const undo={id:randomUUID(),kind:'undo',reverses:id};s.act(undo);s.act(undo);
  assert.equal(s.list()[0].decision,null);assert.equal(s.stats().liked,0);
  assert.throws(()=>s.act({...action,kind:'pass'}),/används redan/);
 }finally{s.close();}
});
test('wrong product snapshot is rejected without partial state or events',()=>{
 const s=openDatabase(':memory:');try{
  const a=s.upsert('zalando',raw()),b=s.upsert('zalando',raw('SKU-B'));
  const snapshot=s.list().find(p=>p.id===b).snapshotId;
  assert.throws(()=>s.act({id:randomUUID(),productId:a,snapshotId:snapshot,kind:'like'}),/Fel produktversion/);
  assert.equal(s.stats().liked,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);
 }finally{s.close();}
});
test('a missing detail refresh preserves already fetched images and composition',()=>{
 const s=openDatabase(':memory:');try{
  s.upsert('zalando',{...raw(),details:{materialText:'100% bomull',images:['https://img01.ztat.net/second.jpg']}});
  s.upsert('zalando',raw());
  assert.equal(s.list()[0].details.materialText,'100% bomull');assert.equal(s.list()[0].images.length,2);
 }finally{s.close();}
});
test('duplicate import clicks reuse the active job and interrupted jobs fail explicitly',()=>{
 const s=openDatabase(':memory:');try{
  const j=s.createJob('zalando');assert.equal(s.createJob('zalando').id,j.id);
  assert.equal(s.claimJob().id,j.id);assert.equal(s.claimJob(),null);
  s.recoverJobs();assert.equal(s.jobs()[0].status,'failed');
  assert.notEqual(s.createJob('asos').id,j.id);
 }finally{s.close();}
});
test('verified SEK refresh keeps the old product identity, likes and GBP snapshot history',()=>{
 const s=openDatabase(':memory:');try{
  const uk={...raw('ASOS-1',8),url:'https://www.asos.com/example/prd/1',currency:'GBP',originalPrice:10};
  const id=s.upsert('asos',uk,'GB');const old=s.list()[0];
  s.act({id:randomUUID(),productId:id,snapshotId:old.snapshotId,kind:'like'});
  const seId=s.upsert('asos',{...uk,price:99,originalPrice:129,currency:'SEK',url:'https://www.asos.com/se/example/prd/1'},'SE');
  assert.equal(seId,id);assert.equal(s.stats().total,1);assert.equal(s.list()[0].saved,true);
  assert.equal(s.list()[0].currency,'SEK');assert.equal(s.list()[0].price,99);
  assert.equal(JSON.parse(s.db.prepare('SELECT data FROM snapshots WHERE id=?').get(old.snapshotId).data).currency,'GBP');
 }finally{s.close();}
});
test('invalid sources create no job and cannot replace the saved source',()=>{
 const s=openDatabase(':memory:');try{
  const previous=s.sources().zalando;
  assert.throws(()=>s.createJob('zalando','https://example.com/herrskor/'));
  assert.equal(s.sources().zalando,previous);assert.equal(s.jobs().length,0);
 }finally{s.close();}
});
test('the chosen category is saved and frozen into its import job',()=>{
 const s=openDatabase(':memory:');try{
  const url='https://www.zalando.se/herrskor/?color=black';
  const job=s.createJob('zalando',url);
  assert.equal(s.sources().zalando,url);assert.equal(job.source_url,url);
  assert.equal(s.createJob('zalando',url).id,job.id);
  assert.throws(()=>s.createJob('zalando','https://www.zalando.se/herrklader/'),/annan hämtning/);
  assert.equal(s.claimJob().source_url,url);
  s.updateJob(job.id,{status:'completed'});
  const newer=s.createJob('zalando','https://www.zalando.se/herrklader/');
  assert.equal(s.jobs().find(j=>j.id===job.id).source_url,url);
  assert.equal(newer.source_url,'https://www.zalando.se/herrklader/');
 }finally{s.close();}
});
test('reviewing a saved item can discard it, and undo restores the saved state',()=>{
 const s=openDatabase(':memory:');try{
  const productId=s.upsert('zalando',raw());
  s.act({id:randomUUID(),productId,kind:'like'});
  const passId=randomUUID();
  s.act({id:passId,productId,kind:'pass',context:{mode:'saved_review'}});
  assert.equal(s.stats().saved,0);
  const undo={id:randomUUID(),kind:'undo',reverses:passId};
  assert.equal(s.act(undo).productId,productId);
  assert.equal(s.act(undo).productId,productId);
  assert.equal(s.stats().saved,1);assert.equal(s.list()[0].decision,'liked');
 }finally{s.close();}
});
