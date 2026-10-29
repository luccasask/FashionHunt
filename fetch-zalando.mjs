import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SOURCE_URLS, validateCategoryUrl } from './import-sources.mjs';

export const SOURCE = DEFAULT_SOURCE_URLS.zalando;

// Read JSON already embedded in the public page. Never execute remote scripts.
export function parseProducts(html) {
  const products = new Map();
  let foundData = false;
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const match = script[1].match(/window\.__hydrationDataConsume\(\s*([\s\S]*?)\s*\);?\s*$/);
    if (!match) continue;
    foundData = true;
    const data = JSON.parse(match[1]);
    for (const entry of Object.values(data.graphqlCache ?? {})) {
      const p = entry?.data?.product;
      if (!p?.sku || !p.brand?.name || !p.name || !p.uri) continue;
      const image = p.extraLargeDefaultMedia?.uri ?? p.largeDefaultMedia?.uri;
      const display = p.displayPrice;
      const money = display?.promotional ?? display?.original;
      const currency = money?.currency ?? display?.original?.currency;
      const price = typeof display?.trackingCurrentAmount === 'number'
        ? display.trackingCurrentAmount : money?.amount / 100;
      if (!image || !Number.isFinite(price) || price < 0 || !currency) continue;
      const url = new URL(p.uri, SOURCE);
      if (url.protocol !== 'https:' || url.hostname !== 'www.zalando.se') continue;
      if (new URL(image).protocol !== 'https:') continue;
      products.set(p.sku, {
        id: p.sku, name: p.name, brand: p.brand.name,
        price, currency, image, url: url.href,
        originalPrice: typeof display?.original?.amount === 'number' ? display.original.amount / 100 : null,
        isSale: typeof display?.original?.amount === 'number' ? price < display.original.amount / 100 : null,
        supplierLabel: p.supplierName ?? null,
        modelName: null,
        categoryCode: p.silhouette ?? null,
        targetGroup: p.navigationTargetGroup ?? null,
      });
    }
  }
  if (!foundData) throw new Error('Produktdata saknas. Sidan kan ha ändrats eller hämtningen blockerats.');
  return [...products.values()];
}

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
