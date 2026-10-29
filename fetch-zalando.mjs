import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SOURCE_URLS, validateCategoryUrl } from './import-sources.mjs';

export const SOURCE = DEFAULT_SOURCE_URLS.zalando;

import {parseProducts} from './zalando-products.mjs';
export {parseProducts} from './zalando-products.mjs';

export async function collectProducts({ limit = 50, maxPages = 5, source = SOURCE, fetchPage, onPage = () => {} } = {}) {
  source = validateCategoryUrl('zalando', source);
  const startPage = Number(new URL(source).searchParams.get('p') ?? 1);
  const products = new Map();
  const pages = [];
  for (let page = 1; page <= maxPages && products.size < limit; page++) {
    const url = new URL(source);
    if (page > 1 || startPage > 1) url.searchParams.set('p', String(startPage + page - 1));
    const html = await fetchPage(url.href, page);
    const parsed = parseProducts(html);
    let added = 0;
    for (const p of parsed) {
      if (products.has(p.id)) continue;
      products.set(p.id, p);
      added++;
      if (products.size === limit) break;
    }
    pages.push({ url: url.href, found: parsed.length, added });
    onPage(pages.at(-1), products.size);
    if (!added) break;
  }
  return { source, fetchedAt: new Date().toISOString(), requested: limit,
    count: products.size, complete: products.size >= limit, pages, products: [...products.values()] };
}

export function toCsv(products) {
  const keys = ['id', 'name', 'brand', 'price', 'originalPrice', 'isSale', 'currency', 'image', 'url'];
  const cell = value => '"' + String(value).replaceAll('"', '""') + '"';
  return '\uFEFF' + [keys, ...products.map(p => keys.map(k => p[k]))]
    .map(row => row.map(cell).join(';')).join('\r\n');
}

async function main() {
  const args = process.argv.slice(2);
  const limit = Number(args[0] ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Ange ett antal mellan 1 och 100.');
  const inputIndex = args.indexOf('--input');
  const input = inputIndex >= 0 ? args[inputIndex + 1] : null;
  if (inputIndex >= 0 && !input) throw new Error('--input kräver en sparad HTML-fil.');
  const result = await collectProducts({
    limit, maxPages: input ? 1 : 5,
    fetchPage: async (url, page) => {
      if (input) return readFile(input, 'utf8');
      // Small, sequential import; stop on access errors rather than retrying around them.
      if (page > 1) await new Promise(r => setTimeout(r, 2000));
      let response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(30000),
          headers: { 'Accept-Language': 'sv-SE,sv;q=0.9', Accept: 'text/html' } });
      } catch (error) {
        throw new Error(`Kunde inte nå Zalando: ${error.cause?.message ?? error.message}`);
      }
      if (!response.ok) throw new Error(`Zalando svarade HTTP ${response.status}. Importen stoppades.`);
      return response.text();
    },
    onPage: (page, count) => console.log(`${page.url}: ${page.found} produkter, totalt ${count}/${limit}`),
  });
  if (!result.count) throw new Error('Inga kompletta produkter hittades. Ingen export skrevs.');
  await mkdir('output', { recursive: true });
  await writeFile('output/products.json', JSON.stringify(result, null, 2) + '\n');
  await writeFile('output/products.csv', toCsv(result.products));
  console.log(`Sparade ${result.count} produkter i output/products.json och output/products.csv`);
  if (!result.complete) {
    console.error(`Ofullständig import: ${result.count} av ${limit}. Se pages i JSON-filen.`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
