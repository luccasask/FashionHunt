import {mkdir,writeFile} from 'node:fs/promises';
import {openDatabase} from '../app/server/database.mjs';
const db=openDatabase('app/data/clothes.sqlite');
const products=db.list();db.close();
const z=products.find(p=>p.store==='zalando'),a=products.find(p=>p.store==='asos');
const bigZ=new URL(z.image);bigZ.searchParams.set('imwidth','1200');
const bigA=new URL(a.image);bigA.searchParams.set('wid','1200');bigA.searchParams.set('fit','constrain');bigA.searchParams.set('qlt','90');
await mkdir('output/image-quality',{recursive:true});
for(const [name,url]of [['asos-current',a.image],['asos-large',bigA.href],['zalando-gallery',z.images.find(u=>u.includes('imwidth=200'))??z.image],['zalando-large',bigZ.href]]){
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`${name}: HTTP ${r.status}`);
 const bytes=Buffer.from(await r.arrayBuffer());
 await writeFile(`output/image-quality/${name}.jpg`,bytes);
 console.log(name,r.status,r.headers.get('content-type'),bytes.length,url);
}
