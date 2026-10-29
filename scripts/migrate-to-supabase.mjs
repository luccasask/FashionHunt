import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {openPostgresDatabase} from '../app/server/postgres.mjs';
import {migrateSqlite} from '../app/server/migrate-sqlite.mjs';
let source,target;
try{
 if(!process.env.FASHIONHUNT_DATABASE_URL)throw new Error('Anslut-Supabase.cmd måste köras först.');
 target=await openPostgresDatabase(process.env.FASHIONHUNT_DATABASE_URL);
 source=new DatabaseSync(fileURLToPath(new URL('../app/data/clothes.sqlite',import.meta.url)),{readOnly:true});
 const result=await migrateSqlite(source,target);console.log('Överföringen är klar. Den lokala databasen är oförändrad.');console.log(JSON.stringify(result));
}catch(e){
 console.error(e.code?'Överföringen kunde inte slutföras. Databasen rullades tillbaka; kontrollera anslutningen.':e.message);process.exitCode=1;
}finally{source?.close();await target?.close();}
