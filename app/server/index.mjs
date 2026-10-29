import express from 'express';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {openDatabase} from './database.mjs';
import {openPostgresDatabase} from './postgres.mjs';
import {startImporter} from './importer.mjs';
import {parseZalandoDetails} from '../../product-data.mjs';

const lan=process.argv.includes('--lan');
const addresses=Object.values(networkInterfaces()).flat().filter(a=>a?.family==='IPv4'&&!a.internal).map(a=>a.address);

const root=fileURLToPath(new URL('../../',import.meta.url));
const dataDir=fileURLToPath(new URL('../data/',import.meta.url));
await mkdir(dataDir,{recursive:true});
const databasePath=process.env.KLADER_DB_PATH??dataDir+'clothes.sqlite';
const cloud=!!process.env.FASHIONHUNT_DATABASE_URL;
const store=cloud?await openPostgresDatabase(process.env.FASHIONHUNT_DATABASE_URL):openDatabase(databasePath);
// Seed only a new database, using the real product exports already captured.
if(!cloud&&(await store.stats()).total===0){
  let zDetails=[];
  try{zDetails=JSON.parse(await readFile(root+'output/zalando-details.json','utf8')).products;}catch{}
  for(const [shop,file]of [['zalando','products.json'],['asos','asos-products.json']]){
    try{
      const result=JSON.parse(await readFile(root+'output/'+file,'utf8'));
      for(const p of result.products){
        const matching=zDetails.find(z=>z.id===p.id);
        const record={...p,...(matching?.details?{details:matching.details}:{} )};
        if(shop==='zalando'&&matching){
          try{const html=await readFile(root+'output/probe/'+(p.id==='R0622S02S-Q11'?'zalando-detail':'zalando-sale')+'.html','utf8');record.details=parseZalandoDetails(html,p.id);}catch{}
        }
        await store.upsert(shop,record,result.market);
      }
    }catch(e){console.log(`Testdata ${shop}: ${e.message}`);}
  }
}
const app=express();
app.disable('x-powered-by');
const port=Number(process.env.PORT??4173);
const allowedHosts=new Set(['localhost','127.0.0.1',...(lan?addresses:[])]);
app.use((req,res,next)=>{
  if(!allowedHosts.has(req.hostname))return res.status(403).json({error:'Okänd värdadress.'});
  const origin=req.headers.origin;
  if(origin){try{const u=new URL(origin);if(u.host!==req.headers.host)return res.status(403).json({error:'Begäran måste komma från appen.'});}catch{return res.status(403).end();}}
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https://*.ztat.net https://images.asos-media.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.get('/healthz',(_req,res)=>res.json({status:'ok'}));
app.get('/robots.txt',(_req,res)=>res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
app.use('/api',express.json({limit:'64kb'}));
app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.get('/api/state',async(_req,res)=>{const [products,stats,undoId,jobs,sources,catalogs]=await Promise.all([store.list(),store.stats(),store.lastDecision(),store.jobs(),store.sources(),store.catalogs()]);res.json({products,stats,undoId,jobs,sources,catalogs,discovery:store.discoveryClock()});});
app.post('/api/actions',async(req,res,next)=>{try{res.json(await store.act(req.body));}catch(e){e.status=400;next(e);}});
app.post('/api/imports',async(req,res,next)=>{try{res.status(202).json(await store.createJob(req.body.store,req.body.url));}catch(e){e.status=400;next(e);}});
app.get('/api/export',async(_req,res)=>{
  res.setHeader('Content-Disposition','attachment; filename="kladapp-data.json"');
  res.json(await store.exportData());
});
app.use('/api',(_req,res)=>res.status(404).json({error:'API-adressen finns inte.'}));
app.use(express.static(fileURLToPath(new URL('../dist/',import.meta.url))));
app.use((error,_req,res,_next)=>{console.error(error.message);res.status(error.status??500).json({error:error.status?error.message:'Ett serverfel inträffade.'});});
const stopImporter=await startImporter(store);
const server=app.listen(port,lan?'0.0.0.0':'127.0.0.1',()=>{
  console.log(`Kläder: http://localhost:${port}`);
  if(lan)for(const ip of addresses)console.log(`iPhone på samma wifi: http://${ip}:${port}`);
  console.log(cloud?'Databas: Supabase/Postgres (fashionhunt-schema)':`Lokal databas: ${databasePath}`);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await stopImporter();await store.close();process.exit(0);});});
