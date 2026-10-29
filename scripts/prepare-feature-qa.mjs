// Prepare only the dedicated QA database, never the user's clothes.sqlite file.
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../app/server/database.mjs';
const db=openDatabase('app/data/segments-sources-review-qa.sqlite');
try {
 if(db.db.prepare('SELECT COUNT(*) AS n FROM events').get().n)throw new Error('Testdatabasen används redan. Den ändras inte.');
 const products=db.list();
 const single=products.find(p=>p.store==='zalando'&&p.images.length===1);
 const multi=products.find(p=>p.store==='asos'&&p.images.length>=3);
 if(!single||!multi)throw new Error('Testprodukter med rätt bildantal saknas.');
 const three=multi.images.slice(0,3);
 db.upsert('asos',{...multi,id:multi.sourceId,images:three,details:{...multi.details,images:three}},multi.market);
 for(const p of products)db.act({id:randomUUID(),productId:p.id,kind:'pass',context:{mode:'qa'}});
 for(const p of [single,multi])db.act({id:randomUUID(),productId:p.id,kind:'like',context:{mode:'qa'}});
 console.log(JSON.stringify({saved:db.list().filter(p=>p.saved).map(p=>({id:p.id,images:p.images.length})),unseen:db.list().filter(p=>!p.decision).length}));
} finally {db.close();}
