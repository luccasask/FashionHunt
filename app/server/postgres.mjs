import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {getCACertificates} from 'node:tls';
import {randomUUID,createHash} from 'node:crypto';
import {DEFAULT_SOURCE_URLS,validateCategoryUrl} from '../../import-sources.mjs';
import {discoveryDay,discoveryClock} from './discovery-clock.mjs';
import {firstCatalogPage} from './catalog-pages.mjs';

export function postgresConfig(connectionString) {
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||decodeURIComponent(url.password)==='[YOUR-PASSWORD]')
  throw new Error('Databasanslutningen saknar ett riktigt lösenord.');
 // Keep certificate verification enabled even if a copied URI specifies weaker SSL options.
 for(const key of [...url.searchParams.keys()])if(/^ssl|^uselibpqcompat$/i.test(key))url.searchParams.delete(key);
 const ssl={rejectUnauthorized:true,servername:url.hostname};
 if(url.hostname.endsWith('.pooler.supabase.com')||url.hostname.endsWith('.supabase.co'))
  ssl.ca=[...getCACertificates('default'),readFileSync(new URL('./certs/supabase-root-2021.pem',import.meta.url),'utf8')];
 return {connectionString:url.href,ssl,max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:30000};
}
export async function openPostgresDatabase(connectionString,{pool:providedPool}={}) {
 const pool=providedPool??new pg.Pool(postgresConfig(connectionString));
 pool.on?.('error',()=>console.error('Databasanslutningen avbröts. Nästa anrop försöker ansluta igen.'));
 const query=async(sql,params=[])=>{const result=await pool.query(sql,params);return result.rows;};
 const one=async(sql,params=[])=> (await query(sql,params))[0];
 async function transaction(fn){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Serialize preference projection, undo and job creation across backend instances.
   await client.query('SELECT pg_advisory_xact_lock(73942016)');
   const q=async(sql,params=[])=> (await client.query(sql,params)).rows;
   const result=await fn(q);await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 }
 try{
  await transaction(async q=>{
   await q(await readFile(new URL('./postgres-schema.sql',import.meta.url),'utf8'));
   for(const [store,url]of Object.entries(DEFAULT_SOURCE_URLS))await q('INSERT INTO fashionhunt.import_sources VALUES($1,$2,$3) ON CONFLICT(store) DO NOTHING',[store,url,new Date().toISOString()]);
  });
 }catch(e){await pool.end();throw e;}
 async function upsert(store,raw,market=store==='zalando'?'SE':'GB'){
  if(!['zalando','asos'].includes(store)||!raw.id||!raw.name||!raw.brand||!raw.image||!Number.isFinite(raw.price))throw new Error('Produkten saknar obligatoriska fält.');
  const url=new URL(raw.url),host=store==='zalando'?'www.zalando.se':'www.asos.com';
  if(url.protocol!=='https:'||url.hostname!==host)throw new Error('Ogiltig butikslänk.');
  const detail=raw.details??{};
  const images=[...new Set([raw.image,...(detail.images??[]),...(raw.images??[])])].filter(u=>typeof u==='string'&&/^https:\/\//.test(u)&&!/\.m3u8/.test(u)).slice(0,20);
  const record={...raw,sourceId:String(raw.id),store,market,priceMinor:Math.round(raw.price*100),originalPriceMinor:raw.originalPrice==null?null:Math.round(raw.originalPrice*100),images,color:detail.color??raw.color??null,type:detail.type??raw.type??null,details:raw.details??null};
  return transaction(async q=>{
   const exact=(await q('SELECT * FROM fashionhunt.products WHERE store=$1 AND source_id=$2 AND market=$3',[store,String(raw.id),market]))[0];
   const old=exact??(!exact&&store==='asos'&&market==='SE'?(await q("SELECT * FROM fashionhunt.products WHERE store='asos' AND source_id=$1 AND market='GB'",[String(raw.id)]))[0]:null);
   const id=old?.id??randomUUID();
   if(old&&!record.details){const p=JSON.parse(old.data);if(p.details){record.details=p.details;record.images=p.images;record.color??=p.color;record.type??=p.type;}}
   const data=JSON.stringify(record),hash=createHash('sha256').update(data).digest('hex'),now=new Date().toISOString();
   const previous=old?.snapshot_id?(await q('SELECT hash FROM fashionhunt.snapshots WHERE id=$1',[old.snapshot_id]))[0]:null;
   const snapshotId=previous?.hash===hash?old.snapshot_id:randomUUID();
   if(old)await q('UPDATE fashionhunt.products SET market=$1,updated_at=$2,data=$3 WHERE id=$4',[market,now,data,id]);
   else await q('INSERT INTO fashionhunt.products(id,store,source_id,market,updated_at,data) VALUES($1,$2,$3,$4,$5,$6)',[id,store,String(raw.id),market,now,data]);
   if(snapshotId!==old?.snapshot_id)await q('INSERT INTO fashionhunt.snapshots VALUES($1,$2,$3,$4,$5)',[snapshotId,id,now,hash,data]);
   await q('UPDATE fashionhunt.products SET snapshot_id=$1 WHERE id=$2',[snapshotId,id]);return id;
  });
 }
 async function list(now=new Date()){
  const day=discoveryDay(now),rows=await query(`SELECT p.*,s.decision,s.saved,
   (SELECT e.created_at FROM fashionhunt.events e WHERE e.product_id=p.id AND e.kind IN ('like','pass')
    AND NOT EXISTS(SELECT 1 FROM fashionhunt.events u WHERE u.kind='undo' AND u.reverses=e.id) ORDER BY e.seq DESC LIMIT 1) AS decided_at
   FROM fashionhunt.products p LEFT JOIN fashionhunt.states s ON s.product_id=p.id ORDER BY p.order_seq`);
  return rows.map(p=>({...JSON.parse(p.data),id:p.id,snapshotId:p.snapshot_id,updatedAt:p.updated_at,decision:p.decision??null,saved:Boolean(p.saved),seenToday:p.decided_at?discoveryDay(p.decided_at)===day:false}));
 }
 const lastDecisionQuery=`SELECT e.id FROM fashionhunt.events e WHERE kind IN ('like','pass') AND NOT EXISTS(SELECT 1 FROM fashionhunt.events u WHERE u.kind='undo' AND u.reverses=e.id) ORDER BY seq DESC LIMIT 1`;
 const lastDecision=async()=> (await one(lastDecisionQuery))?.id??null;
 async function act({id,productId,snapshotId,kind,reverses=null,context={}}){
  if(typeof id!=='string'||!/^\w[\w-]{15,99}$/.test(id)||!['impression','like','pass','unsave','undo','open_store'].includes(kind))throw new Error('Ogiltig handling.');
  return transaction(async q=>{
   const prior=(await q('SELECT * FROM fashionhunt.events WHERE id=$1',[id]))[0];
   if(prior){if(prior.kind!==kind||(kind!=='undo'&&prior.product_id!==(productId??null))||prior.reverses!==reverses)throw new Error('Handlings-ID används redan.');return {id,productId:prior.product_id,duplicate:true};}
   if(kind==='undo'){
    const target=(await q("SELECT * FROM fashionhunt.events WHERE id=$1 AND kind IN ('like','pass')",[reverses]))[0];
    if(!target||target.id!==(await q(lastDecisionQuery))[0]?.id)throw new Error('Det beslutet går inte längre att ångra.');
    productId=target.product_id;snapshotId=target.snapshot_id;
   }
   const product=(await q('SELECT id,snapshot_id FROM fashionhunt.products WHERE id=$1',[productId]))[0];
   if(!product)throw new Error('Produkten finns inte.');snapshotId??=product.snapshot_id;
   if(!(await q('SELECT id FROM fashionhunt.snapshots WHERE id=$1 AND product_id=$2',[snapshotId,productId])).length)throw new Error('Fel produktversion.');
   await q('INSERT INTO fashionhunt.events(id,product_id,snapshot_id,kind,reverses,context,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,productId,snapshotId,kind,reverses,JSON.stringify(context),new Date().toISOString()]);
   if(['like','pass','unsave','undo'].includes(kind)){
    const events=await q(`SELECT e.* FROM fashionhunt.events e WHERE product_id=$1 AND NOT EXISTS(SELECT 1 FROM fashionhunt.events u WHERE u.kind='undo' AND u.reverses=e.id) ORDER BY seq`,[productId]);
    let decision=null,saved=0;for(const e of events){if(e.kind==='like'){decision='liked';saved=1;}if(e.kind==='pass'){decision='passed';saved=0;}if(e.kind==='unsave')saved=0;}
    await q('INSERT INTO fashionhunt.states VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET decision=excluded.decision,saved=excluded.saved',[productId,decision,saved]);
   }
   return {id,productId};
  });
 }
 const sources=async()=>Object.fromEntries((await query('SELECT store,url FROM fashionhunt.import_sources')).map(s=>[s.store,s.url]));
 const catalog=async(store,url)=>await one('SELECT * FROM fashionhunt.import_catalogs WHERE store=$1 AND url=$2',[store,url])??null;
 const catalogs=async()=>Promise.all(Object.entries(await sources()).map(async([store,url])=>({store,url,...await catalog(store,url)})));
 async function catalogStart(store,url,now=new Date()){
  const p=await catalog(store,url);if(p?.exhausted&&discoveryDay(p.checked_at)!==discoveryDay(now))return firstCatalogPage(store,url);
  return p?.next_page??firstCatalogPage(store,url);
 }
 async function saveCatalogPage(store,url,result,now=new Date()){
  const signature=createHash('sha256').update(result.products.map(p=>p.id).sort().join('|')).digest('hex');
  return transaction(async q=>{
   const p=(await q('SELECT * FROM fashionhunt.import_catalogs WHERE store=$1 AND url=$2',[store,url]))[0];
   if(p?.exhausted&&discoveryDay(p.checked_at)!==discoveryDay(now))await q('DELETE FROM fashionhunt.catalog_pages WHERE store=$1 AND url=$2',[store,url]);
   if(result.products.length&&(await q('SELECT page FROM fashionhunt.catalog_pages WHERE store=$1 AND url=$2 AND signature=$3 AND page<>$4',[store,url,signature,result.page])).length)throw new Error('Butiken upprepade en tidigare sida. Importen pausas utan att märkas färdighämtad.');
   await q('INSERT INTO fashionhunt.catalog_pages VALUES($1,$2,$3,$4,$5) ON CONFLICT(store,url,page) DO UPDATE SET signature=excluded.signature,missing_count=excluded.missing_count',[store,url,result.page,signature,result.missingCount??0]);
   const counts=(await q('SELECT COUNT(*) scanned,SUM(missing_count) missing FROM fashionhunt.catalog_pages WHERE store=$1 AND url=$2',[store,url]))[0];
   await q(`INSERT INTO fashionhunt.import_catalogs VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(store,url) DO UPDATE SET next_page=excluded.next_page,scanned_pages=excluded.scanned_pages,total_pages=excluded.total_pages,total_count=excluded.total_count,exhausted=excluded.exhausted,checked_at=excluded.checked_at,missing_count=excluded.missing_count`,[store,url,result.page+1,Number(counts.scanned),result.totalPages,result.totalCount,Number(result.exhausted),new Date(now).toISOString(),Number(counts.missing)]);
  });
 }
 async function createJob(store,sourceUrl){
  const canonical=validateCategoryUrl(store,sourceUrl??(await sources())[store]);
  return transaction(async q=>{
   const existing=(await q("SELECT * FROM fashionhunt.import_jobs WHERE status IN ('queued','running') ORDER BY created_at LIMIT 1"))[0];
   if(existing){if(existing.store===store&&(existing.source_url??DEFAULT_SOURCE_URLS[store])===canonical)return existing;throw new Error('En annan hämtning pågår. Vänta tills den är klar.');}
   const progress=(await q('SELECT * FROM fashionhunt.import_catalogs WHERE store=$1 AND url=$2',[store,canonical]))[0],now=new Date().toISOString();
   if(progress?.exhausted&&discoveryDay(progress.checked_at)===discoveryDay(now))throw new Error('Sista sidan för den här kategorin är redan nådd idag. Du kan kontrollera den igen imorgon.');
   await q('UPDATE fashionhunt.import_sources SET url=$1,updated_at=$2 WHERE store=$3',[canonical,now,store]);
   return (await q('INSERT INTO fashionhunt.import_jobs(id,store,status,created_at,updated_at,message,source_url) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[randomUUID(),store,'queued',now,now,'Väntar på import …',canonical]))[0];
  });
 }
 async function updateJob(id,patch){
  const old=await one('SELECT * FROM fashionhunt.import_jobs WHERE id=$1',[id]);if(!old)throw new Error('Importjobbet finns inte.');
  const next={...old,...patch,updated_at:new Date().toISOString()};
  await query('UPDATE fashionhunt.import_jobs SET status=$1,updated_at=$2,total=$3,completed=$4,failed=$5,message=$6 WHERE id=$7',[next.status,next.updated_at,next.total,next.completed,next.failed,next.message,id]);
 }
 const claimJob=async()=>transaction(async q=> (await q(`UPDATE fashionhunt.import_jobs SET status='running',updated_at=$1,message='Hämtar produktlistan …' WHERE id=(SELECT id FROM fashionhunt.import_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) RETURNING *`,[new Date().toISOString()]))[0]??null);
 const jobs=()=>query('SELECT * FROM fashionhunt.import_jobs ORDER BY created_at DESC LIMIT 10');
 const recoverJobs=()=>query("UPDATE fashionhunt.import_jobs SET status='failed',message='Importen avbröts när servern startades om. Du kan starta en ny import.' WHERE status='running'");
 async function stats(){const r=await one(`SELECT (SELECT COUNT(*) FROM fashionhunt.products) total,COUNT(*) FILTER(WHERE decision='liked') liked,COUNT(*) FILTER(WHERE decision='passed') passed,COUNT(*) FILTER(WHERE saved=1) saved FROM fashionhunt.states`);return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v)]));}
 const exportData=async()=>({exportedAt:new Date().toISOString(),products:await list(),events:await query('SELECT * FROM fashionhunt.events ORDER BY seq'),snapshots:await query('SELECT * FROM fashionhunt.snapshots')});
 return {upsert,list,act,lastDecision,sources,catalog,catalogs,catalogStart,saveCatalogPage,createJob,updateJob,claimJob,jobs,recoverJobs,stats,discoveryClock,exportData,transaction,close:()=>pool.end()};
}
