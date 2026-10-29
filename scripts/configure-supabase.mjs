import {createInterface,emitKeypressEvents} from 'node:readline';
import {stdin,stdout} from 'node:process';
import {writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

async function passwordPrompt(){
 if(!stdin.isTTY||!stdin.setRawMode)throw new Error('Öppna filen genom att dubbelklicka på Anslut-Supabase.cmd i Utforskaren.');
 emitKeypressEvents(stdin);stdin.setRawMode(true);stdin.resume();stdout.write('Databaslösenord (döljs): ');
 return new Promise((resolve,reject)=>{
  let value='';
  const finish=()=>{stdin.off('keypress',keypress);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};
  function keypress(text,key){
   if(key?.ctrl&&key.name==='c'){finish();reject(new Error('Avbrutet. Ingen fil sparades.'));return;}
   if(key?.name==='return'){finish();resolve(value);return;}
   if(key?.name==='backspace'){if(value){value=Array.from(value).slice(0,-1).join('');stdout.write('\b \b');}return;}
   if(text&&!key?.ctrl&&!key?.meta&&!/[\u0000-\u001f\u007f]/.test(text)){value+=text;stdout.write('*'.repeat(Array.from(text).length));}
  }
  stdin.on('keypress',keypress);
 });
}
try{
 console.log('FashionHunt – anslut det NYA Supabase-projektet.');
 console.log('Lösenordet sparas i .env.supabase.local på datorn. Filen är Git-ignorerad.');
 const rl=createInterface({input:stdin,output:stdout});
 const uri=await new Promise(resolve=>rl.question('Klistra in Session pooler URI med [YOUR-PASSWORD] kvar: ',resolve));rl.close();
 const url=new URL(uri.trim());
 if(!['postgres:','postgresql:'].includes(url.protocol)||!/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)||url.port!=='5432'||url.pathname!=='/postgres'||decodeURIComponent(url.password)!=='[YOUR-PASSWORD]')throw new Error('Använd Session pooler URI på port 5432 med lösenordsplatshållaren kvar.');
 if(decodeURIComponent(url.username)!=='postgres.pzdoafvohibhveffdexm')throw new Error('Detta är inte anslutningen till det nya FashionHunt-projektet du angav. Ingen fil sparades.');
 const password=await passwordPrompt();if(!password)throw new Error('Lösenordet får inte vara tomt.');
 url.password=encodeURIComponent(password);
 const configPath=fileURLToPath(new URL('../.env.supabase.local',import.meta.url));
 await writeFile(configPath,`FASHIONHUNT_DATABASE_URL=${url.href}\n`,{mode:0o600});
 const result=spawnSync(process.execPath,['--env-file='+configPath,fileURLToPath(new URL('./check-supabase.mjs',import.meta.url))],{stdio:'inherit',env:{...process.env,FASHIONHUNT_DATABASE_URL:url.href}});
 if(result.status!==0)throw new Error('Anslutningstestet misslyckades. Konfigurationen finns kvar lokalt och kan korrigeras.');
 console.log('Klart. SQLite-databasen och dina lokala favoriter har inte ändrats.');
}catch(error){console.error(error instanceof TypeError?'Anslutningssträngen har ogiltigt format.':error.message);process.exitCode=1;}
