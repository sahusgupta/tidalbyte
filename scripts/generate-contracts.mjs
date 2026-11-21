import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
async function output(path, contents) {
  const url = new URL(`../${path}`, import.meta.url);
  if (check) {
    if (await readFile(url, 'utf8') !== contents) throw new Error(`${path} is stale; run pnpm contracts:generate`);
  } else await writeFile(url, contents);
}
const generated = await compileFromFile(`${root}/contracts/api.schema.json`, {
  cwd: `${root}/contracts`,
  bannerComment: '// Generated from contracts/*.schema.json. Run pnpm contracts:generate. Do not edit.',
  style: { singleQuote: true },
  unknownAny: true,
  ignoreMinAndMaxItems: true,
});
await output('packages/contracts/src/generated.ts', generated);
await output('packages/contracts/src/counties.generated.json', await readFile(new URL('../data/fixtures/houston-counties.geojson', import.meta.url), 'utf8'));
console.log(`TypeScript contracts ${check ? 'match' : 'generated'}.`);
