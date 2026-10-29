import pg from 'npm:pg@8.23.1';
import ca from '../app/server/certs/supabase-root-2021.pem';
import {createPostgresStore} from '../app/server/postgres-store.mjs';
import {runImportSlice} from '../app/server/edge-importer.mjs';

const value=Deno.env.get('FASHIONHUNT_DATABASE_URL');
if(!value)throw new Error('FASHIONHUNT_DATABASE_URL saknas i Edge Function secrets.');
const url=new URL(value);
if(url.hostname!=='aws-0-eu-north-1.pooler.supabase.com'||decodeURIComponent(url.username)!=='postgres.pzdoafvohibhveffdexm'||url.port!=='5432')throw new Error('Fel FashionHunt-databas i Edge-konfigurationen.');
const pool=new pg.Pool({host:url.hostname,port:5432,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:'postgres',ssl:{ca,rejectUnauthorized:true,servername:url.hostname},max:2,connectionTimeoutMillis:15000,idleTimeoutMillis:10000});
pool.on('error',()=>console.error('Databasanslutningen avbröts.'));
const store=await createPostgresStore(pool,{initialize:false,workerMode:'edge'});
const origins=new Set(['https://luccasask.github.io','http://localhost:4173','http://localhost:4174','http://localhost:5173']);
let running=false;
function kick(){
 if(running)return;running=true;
 const task=runImportSlice(store).catch(()=>console.error('Importomgången kunde inte slutföras.')).finally(()=>{running=false;});
 EdgeRuntime.waitUntil(task);
}
const publicJob=({work_data,lease_token,lease_until,...job})=>job;
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(origin){if(!origins.has(origin))return new Response(JSON.stringify({error:'Okänt ursprung.'}),{status:403,headers});headers['Access-Control-Allow-Origin']=origin;}
 headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='content-type, authorization, apikey, x-client-info';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const path=new URL(req.url).pathname.split('/fashionhunt-api/')[1]??'';
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 try{
  if(path==='healthz'&&req.method==='GET')return json({status:'ok'});
  if(path==='worker'&&req.method==='POST'){kick();return json({accepted:true},202);}
  if(path==='state'&&req.method==='GET'){
   const [products,stats,undoId,jobs,sources,catalogs]=await Promise.all([store.list(),store.stats(),store.lastDecision(),store.jobs(),store.sources(),store.catalogs()]);
   if(jobs.some(j=>j.work_mode==='edge'&&['queued','running'].includes(j.status)))kick();
   return json({products,stats,undoId,jobs:jobs.map(publicJob),sources,catalogs,discovery:store.discoveryClock()});
  }
  if(path==='export'&&req.method==='GET')return new Response(JSON.stringify(await store.exportData()),{headers:{...headers,'Content-Disposition':'attachment; filename="fashionhunt-data.json"'}});
  if(req.method==='POST'&&['actions','imports'].includes(path)){
   const text=await req.text();if(new TextEncoder().encode(text).length>65536)return json({error:'Begäran är för stor.'},413);
   let body;try{body=JSON.parse(text);}catch{return json({error:'Ogiltig JSON.'},400);}
   if(path==='actions')return json(await store.act(body));
   const job=await store.createJob(body.store,body.url);kick();return json(publicJob(job),202);
  }
  return json({error:'API-adressen finns inte.'},404);
 }catch(e){
  if(e.code){console.error('Databasfel: '+e.code);return json({error:'Databasen kunde inte nås. Försök igen.'},503);}
  return json({error:e.message??'Begäran kunde inte behandlas.'},400);
 }
});
