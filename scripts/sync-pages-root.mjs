import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const rootAssets = new URL('assets/', root);
const distAssets = new URL('assets/', dist);

await writeFile(new URL('index.html', root), await readFile(new URL('index.html', dist), 'utf8'));

await mkdir(rootAssets, { recursive: true });
for (const file of await readdir(rootAssets)) {
  if (/^index-.*\.(js|css)$/.test(file)) {
    await rm(new URL(file, rootAssets), { force: true });
  }
}

await cp(distAssets, rootAssets, { recursive: true });
await cp(new URL('marks.json', dist), new URL('marks.json', root));
await cp(new URL('scales.json', dist), new URL('scales.json', root));
