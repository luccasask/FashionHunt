import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,X509Certificate} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openPostgresDatabase,postgresConfig} from './postgres.mjs';
import {openDatabase} from './database.mjs';
import {migrateSqlite} from './migrate-sqlite.mjs';
const raw=(id='A',price=499)=>({id,name:'Tröja',brand:'Test',price,originalPrice:599,currency:'SEK',image:'https://img01.ztat.net/test.jpg',url:'https://www.zalando.se/test.html'});
export async function testPool(){
 const db=new PGlite();
 const query=async(sql,params=[])=>{
  if(sql.startsWith('CREATE SCHEMA')){await db.exec(sql);return {rows:[]};}
  return db.query(sql,params);
 };
 return {query,connect:async()=>({query,release(){}}),end:()=>db.close()};
}
test('Postgres preserves product identity, snapshots, favorites, daily rounds, idempotency and undo',async()=>{
 const pool=await testPool(),s=await openPostgresDatabase('',{pool});
 try{
  const id=await s.upsert('zalando',{...raw(),details:{materialText:'Bomull',images:['https://img01.ztat.net/second.jpg']}});
  const initial=(await s.list())[0],action={id:randomUUID(),productId:id,snapshotId:initial.snapshotId,kind:'like'};
  await s.act(action);assert.equal((await s.act(action)).duplicate,true);
  await s.upsert('zalando',raw('A',399));let product=(await s.list())[0];
  assert.equal(product.id,id);assert.equal(product.saved,true);assert.equal(product.details.materialText,'Bomull');assert.equal(product.images.length,2);
  const pass={id:randomUUID(),productId:id,kind:'pass'};await s.act(pass);
  assert.equal((await s.list())[0].seenToday,true);
  assert.equal((await s.list(new Date(Date.now()+86400000)))[0].seenToday,false);
  await s.act({id:randomUUID(),kind:'undo',reverses:pass.id});assert.equal((await s.list())[0].saved,true);
  const other=await s.upsert('zalando',raw('B'));
  await assert.rejects(s.act({id:randomUUID(),productId:other,snapshotId:initial.snapshotId,kind:'like'}),/Fel produktversion/);
  const out=await s.exportData();assert.equal(out.events.length,3);assert.equal(JSON.parse(out.snapshots.find(p=>p.id===initial.snapshotId).data).price,499);
  assert.equal((await s.stats()).saved,1);
 }finally{await s.close();}
});
test('Postgres isolates schema, persists category cursor and serializes queued jobs',async()=>{
 const pool=await testPool();await pool.query('CREATE TABLE public.unrelated (name text)');await pool.query("INSERT INTO public.unrelated VALUES('keep')");
 const s=await openPostgresDatabase('',{pool});
 try{
  const url='https://www.zalando.se/herrskor/';
  await assert.rejects(s.createJob('zalando','https://example.com/'));
  assert.equal((await s.jobs()).length,0);
  const job=await s.createJob('zalando',url);assert.equal((await s.createJob('zalando',url)).id,job.id);
  assert.equal((await s.claimJob()).id,job.id);assert.equal(await s.claimJob(),null);
  await s.recoverJobs();assert.equal((await s.jobs())[0].status,'failed');
  const page={page:1,totalPages:2,totalCount:2,products:[{id:'A'}],exhausted:false,missingCount:1};
  await s.saveCatalogPage('zalando',url,page);assert.equal(await s.catalogStart('zalando',url),2);
  await assert.rejects(s.saveCatalogPage('zalando',url,{...page,page:2}),/upprepade/);
  await s.saveCatalogPage('zalando',url,{...page,page:2,products:[{id:'B'}],exhausted:true,missingCount:0});
  assert.equal((await s.catalogs()).find(c=>c.store==='zalando').missing_count,1);
  await assert.rejects(s.createJob('zalando',url),/redan nådd/);
  assert.equal(await s.catalogStart('zalando',url,new Date(Date.now()+86400000)),1);
  assert.deepEqual((await pool.query('SELECT * FROM public.unrelated')).rows,[{name:'keep'}]);
  const security=await pool.query("SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='fashionhunt' AND relkind='r'");
  assert.equal(security.rows.length,8);assert.ok(security.rows.every(r=>r.relrowsecurity));
 }finally{await s.close();}
});
test('database configuration never disables TLS verification or accepts a password placeholder',()=>{
 assert.throws(()=>postgresConfig('postgresql://postgres:[YOUR-PASSWORD]@example.com:5432/postgres'),/lösenord/);
 const config=postgresConfig('postgresql://postgres:example@db.example.com:5432/postgres?sslmode=no-verify');
 assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(new URL(config.connectionString).searchParams.has('sslmode'),false);
 assert.equal(config.ssl.ca,undefined);assert.equal(config.ssl.servername,'db.example.com');
});
test('Supabase trusts its official CA only for Supabase hosts and still verifies hostname and certificate',()=>{
 const config=postgresConfig('postgresql://postgres:example@aws-0-eu-north-1.pooler.supabase.com:5432/postgres?ssl=false&sslmode=no-verify');
 const ca=new X509Certificate(config.ssl.ca.at(-1));
 assert.equal(ca.ca,true);assert.ok(ca.verify(ca.publicKey));
 assert.equal(ca.fingerprint256,'80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
 assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.servername,'aws-0-eu-north-1.pooler.supabase.com');
 assert.equal(new URL(config.connectionString).searchParams.has('ssl'),false);
 assert.equal(postgresConfig('postgresql://postgres:example@fake-pooler.supabase.com.example.org:5432/postgres').ssl.ca,undefined);
});
test('SQLite transfer preserves IDs, favorites, version history, undo and event sequence without overwriting either database',async()=>{
 const source=openDatabase(':memory:'),pool=await testPool(),target=await openPostgresDatabase('',{pool});
 try{
  const productId=source.upsert('zalando',raw());
  const initial=source.list()[0];source.act({id:randomUUID(),productId,kind:'like'});
  const pass=randomUUID();source.act({id:pass,productId,kind:'pass'});source.act({id:randomUUID(),kind:'undo',reverses:pass});
  source.upsert('zalando',raw('A',399));
  const copied=await migrateSqlite(source.db,target);assert.equal(copied.saved,1);assert.equal(copied.events,3);
  const product=(await target.list())[0];assert.equal(product.id,productId);assert.equal(product.saved,true);assert.equal(product.price,399);
  const out=await target.exportData();assert.equal(out.snapshots.length,2);assert.equal(JSON.parse(out.snapshots.find(s=>s.id===initial.snapshotId).data).price,499);
  await target.act({id:randomUUID(),productId,kind:'pass'});assert.equal((await target.exportData()).events.length,4);
  await assert.rejects(migrateSqlite(source.db,target),/innehåller redan/);
  assert.equal((await target.exportData()).events.length,4);assert.equal(source.stats().saved,1);assert.equal(source.db.prepare('SELECT COUNT(*) n FROM events').get().n,3);
 }finally{source.close();await target.close();}
});
test('a failed SQLite transfer rolls back every copied row',async()=>{
 const source=openDatabase(':memory:'),pool=await testPool(),target=await openPostgresDatabase('',{pool});
 try{
  const id=source.upsert('zalando',raw());source.act({id:randomUUID(),productId:id,kind:'like'});
  const faulty={transaction:fn=>target.transaction(q=>fn(async(sql,params)=>{if(sql.startsWith('INSERT INTO fashionhunt.events'))throw new Error('simulated write failure');return q(sql,params);} ))};
  await assert.rejects(migrateSqlite(source.db,faulty),/simulated/);
  assert.equal((await target.stats()).total,0);assert.equal((await target.exportData()).snapshots.length,0);
  assert.equal(source.stats().saved,1);
 }finally{source.close();await target.close();}
});
