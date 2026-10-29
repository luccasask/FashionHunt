import {createPostgresStore} from './postgres-store.mjs';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {getCACertificates} from 'node:tls';

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
 return createPostgresStore(pool,{schemaSQL:await readFile(new URL('./postgres-schema.sql',import.meta.url),'utf8')});
}
