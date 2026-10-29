import {openPostgresDatabase} from '../app/server/postgres.mjs';
const value=process.env.FASHIONHUNT_DATABASE_URL;
if(!value){console.error('FASHIONHUNT_DATABASE_URL saknas. Kör Anslut-Supabase.cmd.');process.exitCode=1;}
else{
 let store;
 try{
  store=await openPostgresDatabase(value);
  console.log('Anslutning och TLS verifierade. FashionHunts separata schema är förberett.');
  console.log(JSON.stringify(await store.stats()));
 }catch(error){
  // Never print the connection URI, password, config or raw provider error.
  console.error(`Anslutningen misslyckades (${String(error.code??'anslutningsfel').replace(/[^A-Z0-9_-]/gi,'')}). Kontrollera lösenord, pooler-URI och att projektet är aktivt.`);
  process.exitCode=1;
 }finally{await store?.close();}
}
