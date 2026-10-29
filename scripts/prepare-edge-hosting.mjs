import {openPostgresDatabase} from '../app/server/postgres.mjs';
let store;
try{
 store=await openPostgresDatabase(process.env.FASHIONHUNT_DATABASE_URL);
 await store.transaction(async q=>{
  await q('CREATE EXTENSION IF NOT EXISTS pg_cron');
  await q('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  const sql=`SELECT net.http_post(url:='https://pzdoafvohibhveffdexm.supabase.co/functions/v1/fashionhunt-api/worker',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=10000) WHERE EXISTS(SELECT 1 FROM fashionhunt.import_jobs WHERE work_mode='edge' AND status IN ('queued','running'));`;
  await q("SELECT cron.schedule('fashionhunt-import-worker','* * * * *',$1)",[sql]);
 });
 console.log('Schema och FashionHunts fortsatta importomgångar är förberedda.');
}catch(e){console.error('Edge-förberedelsen misslyckades: '+String(e.code??e.message));process.exitCode=1;}
finally{await store?.close();}
