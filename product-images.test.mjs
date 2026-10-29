import test from 'node:test';
import assert from 'node:assert/strict';
import {displayImageUrl,uniqueProductImages} from './product-images.mjs';

test('Zalando thumbnails become large photos without losing the packshot filter',()=>{
  const result=new URL(displayImageUrl('https://img01.ztat.net/article/example.jpg?imwidth=200&filter=packshot'));
  assert.equal(result.searchParams.get('imwidth'),'1200');
  assert.equal(result.searchParams.get('filter'),'packshot');
});
test('ASOS default thumbnails request a verified high resolution',()=>{
  const result=new URL(displayImageUrl('https://images.asos-media.com/products/example/1?$n_480w$&wid=313'));
  assert.equal(result.searchParams.get('wid'),'1200');
  assert.equal(result.searchParams.get('qlt'),'90');
  assert.equal(result.searchParams.has('$n_480w$'),false);
});
test('different thumbnail sizes of the same photo do not duplicate gallery entries',()=>{
  const large='https://img01.ztat.net/article/a.jpg?imwidth=780';
  const small='https://img01.ztat.net/article/a.jpg?imwidth=200';
  const second='https://img01.ztat.net/article/b.jpg?imwidth=200';
  assert.deepEqual(uniqueProductImages([large,small,second]),[large,second]);
  assert.equal(displayImageUrl('https://example.com/image.jpg'),'https://example.com/image.jpg');
});
