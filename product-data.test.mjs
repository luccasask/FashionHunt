import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAsosProducts} from './fetch-asos.mjs';
import {parseAsosDetails,parseZalandoDetails,readString} from './product-data.mjs';

test('ASOS import keeps sale price, original price, colour and actual currency',()=>{
 const d={config:{country:{defaultCurrency:'GBP',countryCode:'GB'}},search:{products:[{
  id:1,brandName:'ASOS DESIGN',description:'T-shirt',url:'test/prd/1',image:'images.asos-media.com/test',
  price:20,reducedPrice:13.99,isSale:true,colour:'BROWN'}]}};
 const literal=JSON.stringify(d).replaceAll('\\','\\\\').replaceAll("'","\\'");
 const html="<script>window.asos.plp._data=JSON.parse('"+literal+"');</script>";
 const p=parseAsosProducts(html,1).products[0];
 assert.equal(p.price,13.99);assert.equal(p.originalPrice,20);
 assert.equal(p.discountPercent,30);assert.equal(p.isSale,true);assert.equal(p.currency,'GBP');
 assert.equal(p.color,'BROWN');assert.equal(p.details,null);
});
test('Swedish ASOS data keeps SEK prices and links to the Swedish product page',()=>{
 const d={config:{country:{defaultCurrency:'SEK',countryCode:'SE'}},search:{products:[{
  id:211059938,brandName:'ASOS DESIGN',description:'Huvtröja',url:'asos-design/huvtroja/prd/211059938',
  image:'images.asos-media.com/products/huvtroja/1',price:349,isSale:false,colour:'isgrå'}]}};
 const literal=JSON.stringify(d).replaceAll('\\','\\\\').replaceAll("'","\\'");
 const result=parseAsosProducts("<script>window.asos.plp._data=JSON.parse('"+literal+"');</script>",1);
 assert.equal(result.currency,'SEK');assert.equal(result.market,'SE');assert.equal(result.products[0].price,349);
 assert.equal(new URL(result.products[0].url).pathname,'/se/asos-design/huvtroja/prd/211059938');
});
test('ASOS detail sample reads composition and does not mistake missing ratings for zero',()=>{
 const html=readFileSync(new URL('./fixtures/asos-detail.html',import.meta.url),'utf8');
 const d=parseAsosDetails(html,211946930);
 assert.equal(d.type,'T-shirts');assert.match(d.materialText,/100% Cotton/);
 assert.equal(d.fit,'Regular fit');assert.equal(d.rating,null);assert.equal(d.ratingStatus,'not_in_html');
 assert.throws(()=>parseAsosDetails(html,'another-id'),/fel eller saknad/);
});
test('Zalando detail sample reads material, fabric, cut and explicit review status',()=>{
 const html=readFileSync(new URL('./fixtures/zalando-detail.html',import.meta.url),'utf8');
 const d=parseZalandoDetails(html,'R0622S02S-Q11');
 assert.equal(d.materialText,'100% polyester');assert.equal(d.fabric,'Sweatshirttyg');
 assert.equal(d.cut,'Rak');assert.equal(d.fit,'Regular');assert.equal(d.rating,null);
 assert.equal(d.ratingStatus,'not_reviewed');
 assert.throws(()=>parseZalandoDetails(html,'another-id'),/fel eller saknad/);
});
test('embedded strings are decoded as data, not executed',()=>{
 assert.equal(readString("'a\\'b\\n\\u00e5'",0),"a'b\nå");
 assert.equal(readString("'process.exit()'",0),'process.exit()');
});
