import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPageUrl,parseCatalogPage} from './catalog-pages.mjs';
import {discoveryClock,discoveryDay} from './discovery-clock.mjs';
const source='https://www.zalando.se/herrskor/';
const p=id=>({sku:id,name:'Skor',brand:{name:'Test'},uri:`https://www.zalando.se/test-${id}.html`,largeDefaultMedia:{uri:'https://img01.ztat.net/test.jpg'},displayPrice:{original:{amount:10000,currency:'SEK'}}});
const html=(page=1,totalPages=2,ids=['A','B'],available=ids)=>'<script>window.__hydrationDataConsume('+JSON.stringify({graphqlCache:{collection:{data:{collection:{uri:source,entities:{edges:ids.map(id=>({node:{__typename:'Product',id:'ern:product::'+id}})),pageInfo:{currentPage:page,numberOfPages:totalPages},totalCount:4}}}},...Object.fromEntries(available.map(id=>[id,{data:{product:p(id)}}]))}})+');</script>';
test('catalog metadata distinguishes a batch from the final page and records missing products',()=>{
 assert.equal(parseCatalogPage('zalando',html(),source,1).exhausted,false);
 const last=parseCatalogPage('zalando',html(2,2,['A','B'],['A']),source,2);
 assert.equal(last.exhausted,true);assert.equal(last.missingCount,1);assert.equal(last.products.length,1);
 assert.throws(()=>parseCatalogPage('zalando',html(),source,2),/i stället/);
 assert.throws(()=>parseCatalogPage('zalando','<html>Access denied</html>',source,1),/Sidinformation/);
});
test('page URLs preserve selected filters',()=>{
 const u=new URL(catalogPageUrl('zalando',source+'?color=black',3));assert.equal(u.searchParams.get('p'),'3');assert.equal(u.searchParams.get('color'),'black');
 const a=new URL(catalogPageUrl('asos','https://www.asos.com/se/man/cat/?cid=123',2));assert.equal(a.searchParams.get('page'),'2');
});
test('daily reset uses Swedish midnight across summer and winter time changes',()=>{
 assert.equal(discoveryDay('2026-10-29T23:00:00Z'),'2026-10-30');
 assert.equal(discoveryClock('2026-10-24T22:00:00Z').nextResetAt,'2026-10-25T23:00:00.000Z');
 assert.equal(discoveryClock('2026-03-28T23:00:00Z').nextResetAt,'2026-03-29T22:00:00.000Z');
});
