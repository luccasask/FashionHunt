import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCategoryUrl,DEFAULT_SOURCE_URLS} from './import-sources.mjs';
import {fetchStoreHtml} from './app/server/source-fetch.mjs';

test('connection failures and access denials are explained without exposing transport internals',async()=>{
 await assert.rejects(fetchStoreHtml('https://www.asos.com/se/man/cat/?cid=1','asos',async()=>{throw new Error('http2 error from internal-address');}),e=>/Kunde inte ansluta/.test(e.message)&&!e.message.includes('internal-address'));
 await assert.rejects(fetchStoreHtml('https://www.zalando.se/herrklader/','zalando',async()=>({ok:false,status:403})),/HTTP 403: Butiken tillåter inte/);
});

test('shoe category URLs preserve filters and normalize the retailer hostname',()=>{
  assert.equal(validateCategoryUrl('zalando',' https://zalando.se/herrskor?brand=nike&p=3&utm_source=test '),
    'https://www.zalando.se/herrskor/?brand=nike&p=3');
  assert.equal(validateCategoryUrl('asos','https://www.asos.com/se/man/skor/cat/?cid=4209&currentpricerange=0-500'),
    'https://www.asos.com/se/man/skor/cat/?cid=4209&currentpricerange=0-500');
});
test('invalid URLs, credentials, wrong shops and product pages are rejected',()=>{
  for(const url of ['', 'not a url','http://www.zalando.se/herrskor/','https://www.zalando.se.evil.example/herrskor/',
    'https://127.0.0.1/herrskor/','https://www.zalando.se:8443/herrskor/',
    'https://user:password@www.zalando.se/herrskor/','https://www.zalando.se/product.html',
    'https://www.zalando.se/api/products','https://www.zalando.se/herrskor/?p=NaN'])
    assert.throws(()=>validateCategoryUrl('zalando',url),url);
  assert.throws(()=>validateCategoryUrl('constructor',DEFAULT_SOURCE_URLS.asos));
  assert.throws(()=>validateCategoryUrl('asos','https://www.asos.com/men/shoes/cat/?cid=4209'),/svenska/);
  assert.throws(()=>validateCategoryUrl('asos','https://www.asos.com/se/brand/shoe/prd/123'));
  assert.throws(()=>validateCategoryUrl('asos','https://www.asos.com/se/man/skor/cat/?cid=hello'));
});
test('redirects outside the selected shop are stopped before the second request',async()=>{
  const requested=[];
  await assert.rejects(fetchStoreHtml(DEFAULT_SOURCE_URLS.zalando,'zalando',async url=>{
    requested.push(url);return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  }));
  assert.deepEqual(requested,[DEFAULT_SOURCE_URLS.zalando]);
});
test('same-shop redirects can load a category without dropping locale or filters',async()=>{
  const requested=[];
  const html=await fetchStoreHtml(DEFAULT_SOURCE_URLS.zalando,'zalando',async url=>{
    requested.push(url);
    return requested.length===1?new Response(null,{status:302,headers:{location:'/herrskor/?color=black'}}):new Response('<html>category</html>');
  });
  assert.equal(requested[1],'https://www.zalando.se/herrskor/?color=black');
  assert.equal(html,'<html>category</html>');
});
