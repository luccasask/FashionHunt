import {spawnSync} from 'node:child_process';
import {writeFile,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const project='pzdoafvohibhveffdexm';
const secretPath=fileURLToPath(new URL('../supabase/.temp/deploy-secrets.env',import.meta.url));
try{
 if(!process.env.FASHIONHUNT_DATABASE_URL)throw new Error('Databasanslutningen saknas.');
 const uri=new URL(process.env.FASHIONHUNT_DATABASE_URL);
 if(decodeURIComponent(uri.username)!=='postgres.'+project)throw new Error('Fel databasprojekt.');
 const cli=fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js',import.meta.url));
 await mkdir(new URL('../supabase/.temp/',import.meta.url),{recursive:true});
 await writeFile(secretPath,`FASHIONHUNT_DATABASE_URL=${uri.href}\n`,{mode:0o600});
 // A file is used instead of putting credentials in process arguments or logs.
 const run=args=>{const r=spawnSync(process.execPath,[cli,...args],{stdio:'inherit'});if(r.status!==0)throw new Error('Supabase-kommandot misslyckades.');};
 run(['secrets','set','--env-file',secretPath,'--project-ref',project]);
 run(['functions','deploy','fashionhunt-api','--project-ref',project,'--no-verify-jwt','--use-api']);
 console.log('FashionHunt API publicerat.');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await rm(secretPath,{force:true});}
