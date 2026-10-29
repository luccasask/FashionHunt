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
  const code=String(error.code??'anslutningsfel').replace(/[^A-Z0-9_-]/gi,'');
  const detail=/CERT|SELF_SIGNED|ISSUER|TLS/.test(code)?'TLS-certifikatet kunde inte verifieras. Kontrollera appens Supabase-rotcertifikat och att systemets datum är rätt.':'Kontrollera lösenord, pooler-URI och att projektet är aktivt.';
  console.error(`Anslutningen misslyckades (${code}). ${detail}`);
  process.exitCode=1;
 }finally{await store?.close();}
}
