// Downloads the Elgato layout JSON schema into the repo. The app derives its
// validation, defaults, and editor hints from this file. (It is vendored rather
// than fetched at runtime because schemas.elgato.com does not send CORS headers.)
import { writeFile } from 'node:fs/promises';

const URL = 'https://schemas.elgato.com/streamdeck/plugins/layout.json';
const OUT = new globalThis.URL('../src/lib/layout/schema/layout.schema.json', import.meta.url);

const res = await fetch(URL);
if (!res.ok) throw new Error(`GET ${URL}: ${res.status} ${res.statusText}`);
const schema = await res.json();
await writeFile(OUT, JSON.stringify(schema, null, '\t') + '\n');
console.log(`Saved ${schema.$id ?? 'schema'} to ${OUT.pathname}`);
