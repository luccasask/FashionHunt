import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProducts, collectProducts, toCsv } from './fetch-zalando.mjs';

const product = (sku = 'TEST-1') => ({ sku, name: 'Jacka – svart', brand: { name: 'Test' },
  navigationTargetGroup: 'MEN', uri: 'https://www.zalando.se/test.html',
  extraLargeDefaultMedia: { uri: 'https://img01.ztat.net/test.jpg' },
  displayPrice: { trackingCurrentAmount: 499.99, promotional: { amount: 49999 },
    original: { amount: 69999, currency: 'SEK' } } });
const page = products => '<script>window.__hydrationDataConsume(' + JSON.stringify({
  graphqlCache: Object.fromEntries(products.map((p,i) => [i, { data: { product: p } }]))
}) + ');</script>';

test('sale price uses current amount and inherits currency from original price', () => {
  const p = parseProducts(page([product()]))[0];
  assert.equal(p.price, 499.99);
  assert.equal(p.currency, 'SEK');
  assert.equal(p.brand, 'Test');
  assert.equal(p.image, 'https://img01.ztat.net/test.jpg');
});
test('fallback price is converted from minor units and incomplete items are excluded', () => {
  const p = product();
  delete p.displayPrice.trackingCurrentAmount;
  assert.equal(parseProducts(page([p]))[0].price, 499.99);
  delete p.extraLargeDefaultMedia;
  assert.deepEqual(parseProducts(page([p])), []);
  assert.throws(() => parseProducts('<html>Access denied</html>'), /Produktdata saknas/);
});
test('pagination deduplicates and stops exactly at requested count', async () => {
  const result = await collectProducts({ limit: 3, fetchPage: async (_, n) =>
    page(n === 1 ? [product('A'), product('B')] : [product('B'), product('C'), product('D')]) });
  assert.deepEqual(result.products.map(p => p.id), ['A', 'B', 'C']);
  assert.equal(result.pages.length, 2);
  assert.equal(result.complete, true);
});
test('repeated pages stop with an explicitly incomplete result', async () => {
  const result = await collectProducts({ limit: 50, fetchPage: async () => page([product()]) });
  assert.equal(result.count, 1);
  assert.equal(result.complete, false);
  assert.equal(result.pages.length, 2);
});
test('CSV escapes quotes and preserves Unicode', () => {
  assert.match(toCsv([{...product(), name:'En "tröja"'}]), /"En ""tröja"""/);
});
test('a selected shoe category and its filters are used on every requested page',async()=>{
 const requests=[];
 const result=await collectProducts({limit:3,source:'https://www.zalando.se/herrskor/?brand=nike&p=3',fetchPage:async(url,n)=>{
  requests.push(new URL(url));return page(n===1?[product('SHOE-A'),product('SHOE-B')]:[product('SHOE-C')]);
 }});
 assert.equal(result.count,3);assert.deepEqual(requests.map(u=>u.pathname),['/herrskor/','/herrskor/']);
 assert.deepEqual(requests.map(u=>u.searchParams.get('p')),['3','4']);
 assert.ok(requests.every(u=>u.searchParams.get('brand')==='nike'));
});
test('a selected category can include unisex products',()=>{
 const p=product('UNISEX');p.navigationTargetGroup='ALL';p.silhouette='SNEAKER';
 assert.equal(parseProducts(page([p]))[0].categoryCode,'SNEAKER');
});
