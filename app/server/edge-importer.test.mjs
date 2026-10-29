import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresStore} from './postgres-store.mjs';
import {runImportSlice} from './edge-importer.mjs';
const source='https://www.zalando.se/herrklader/';
async function store(){
 const db=new PGlite();
 const query=async(sql,params=[])=>{if(sql.startsWith('CREATE SCHEMA')){await db.exec(sql);return {rows:[]};}return db.query(sql,params);};
 const pool={query,connect:async()=>({query,release(){}}),end:()=>db.close()};
 return createPostgresStore(pool,{schemaSQL:await readFile(new URL('./postgres-schema.sql',import.meta.url),'utf8'),workerMode:'edge'});
}
const product=id=>({sku:id,name:'Tröja',brand:{name:'Test'},uri:`https://www.zalando.se/test-${id}.html`,largeDefaultMedia:{uri:'https://img01.ztat.net/test.jpg'},displayPrice:{original:{amount:29900,currency:'SEK'}}});
function listing(){return '<script>window.__hydrationDataConsume('+JSON.stringify({graphqlCache:{c:{data:{collection:{uri:source,entities:{edges:['A','B'].map(id=>({node:{__typename:'Product',id:'ern:product::'+id}})),pageInfo:{currentPage:1,numberOfPages:2},totalCount:4}}}},a:{data:{product:product('A')}},b:{data:{product:product('B')}}}})+');</script>';}
test('Edge import resumes details across invocations without repeating its category page or losing a favorite',async()=>{
 const s=await store();try{
  const job=await s.createJob('zalando',source),calls=[];
  const fixture=await readFile(new URL('../../fixtures/zalando-detail.html',import.meta.url),'utf8');
  const fetchHtml=async url=>{calls.push(url);if(new URL(url).pathname==='/herrklader/')return listing();const id=url.includes('-A.html')?'A':'B';return fixture.replaceAll('R0622S02S-Q11',id);};
  const options={jobId:job.id,fetchHtml,delay:async()=>{},maxDetails:1};
  assert.equal((await runImportSlice(s,options)).done,false);
  assert.equal((await s.jobs())[0].completed,1);assert.equal((await s.jobs())[0].status,'running');
  assert.equal(await s.claimJob(),null);await s.recoverJobs();assert.equal((await s.jobs())[0].status,'running');
  const b=(await s.list()).find(p=>p.sourceId==='B');await s.act({id:randomUUID(),productId:b.id,kind:'like'});
  assert.equal((await runImportSlice(s,options)).done,true);
  const complete=(await s.jobs())[0];assert.equal(complete.status,'completed');assert.equal(complete.completed,2);assert.equal(complete.work_data,null);
  assert.equal((await s.list()).find(p=>p.id===b.id).saved,true);assert.equal(await s.catalogStart('zalando',source),2);
  assert.equal(calls.filter(url=>new URL(url).pathname==='/herrklader/').length,1);
 }finally{await s.close();}
});
test('Edge leases prevent simultaneous processing and reject writes from an expired owner',async()=>{
 const s=await store();try{
  const job=await s.createJob('zalando',source),now=new Date();
  const first=await s.leaseEdgeJob(job.id,now);assert.equal(await s.leaseEdgeJob(job.id,now),null);
  assert.equal((await runImportSlice(s,{jobId:job.id})).idle,true);
  const second=await s.leaseEdgeJob(job.id,new Date(now.getTime()+140000));assert.notEqual(first.lease_token,second.lease_token);
  await assert.rejects(s.saveEdgeJob(job.id,first.lease_token,{completed:99}),/tagits över/);
  await s.releaseEdgeJob(job.id,first.lease_token);assert.equal((await s.jobs())[0].lease_token,second.lease_token);
  await s.releaseEdgeJob(job.id,second.lease_token);
 }finally{await s.close();}
});
test('a blocked listing does not advance its cursor or claim the category is exhausted',async()=>{
 const s=await store();try{
  const job=await s.createJob('zalando',source);
  await runImportSlice(s,{jobId:job.id,fetchHtml:async()=>{throw new Error('HTTP 403');}});
  assert.equal((await s.jobs())[0].status,'failed');assert.equal(await s.catalogStart('zalando',source),1);assert.equal(await s.catalog('zalando',source),null);
 }finally{await s.close();}
});
