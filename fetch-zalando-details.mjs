// Small live sample of product detail pages; run explicitly, outside unit tests.
import {readFile,writeFile} from 'node:fs/promises';
import {parseZalandoDetails} from './product-data.mjs';
import {getHtml} from './fetch-asos.mjs';

const data=JSON.parse(await readFile('output/products.json','utf8'));
const result=[];
for(const p of data.products.slice(0,2)){
  await new Promise(r=>setTimeout(r,1500));
  try{result.push({...p,details:parseZalandoDetails(await getHtml(p.url),p.id),detailStatus:'fetched'});}
  catch(e){result.push({...p,detailStatus:'error',detailError:e.message});process.exitCode=2;}
}
await writeFile('output/zalando-details.json',JSON.stringify({fetchedAt:new Date().toISOString(),products:result},null,2)+'\n');
console.log('Sparade',result.length,'Zalando-detaljtester.');
