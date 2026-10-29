import {openPostgresDatabase} from '../app/server/postgres.mjs';
import {startImporter} from '../app/server/importer.mjs';
const shop=process.argv[2];let store,stop;
try{
 if(!['zalando','asos'].includes(shop))throw new Error('Välj zalando eller asos.');
 if(!process.env.FASHIONHUNT_DATABASE_URL)throw new Error('Den lokala Supabase-anslutningen saknas. Kör Anslut-Supabase.cmd först.');
 store=await openPostgresDatabase(process.env.FASHIONHUNT_DATABASE_URL);
 const job=await store.createJob(shop,(await store.sources())[shop]);
 if(job.work_mode==='edge')throw new Error('En molnhämtning pågår. Vänta tills den är klar.');
 stop=await startImporter(store,{recover:false});
 console.log('Hämtar nästa sida från '+(shop==='zalando'?'Zalando':'ASOS')+'. Produkterna sparas direkt i Supabase.');
 let previous='';
 while(true){
  const current=(await store.jobs()).find(j=>j.id===job.id);if(!current)throw new Error('Importjobbet saknas.');
  if(current.message!==previous){console.log(current.message);previous=current.message;}
  if(!['queued','running'].includes(current.status)){
   if(current.status==='failed')process.exitCode=1;
   console.log(current.status==='failed'?'Hämtningen misslyckades. Tidigare sparade produkter finns kvar.':'Klart. Uppdatera FashionHunt på mobilen för att se produkterna.');break;
  }
  await new Promise(r=>setTimeout(r,2500));
 }
}catch(e){console.error(e.code?'Databasen kunde inte nås. Kontrollera anslutningen.':e.message);process.exitCode=1;}
finally{await stop?.();await store?.close();}
