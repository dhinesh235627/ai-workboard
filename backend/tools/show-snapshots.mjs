// Lists the tab-switch snapshots stored in Blob Storage and saves the newest ones to a folder so
// you can open them. READ-ONLY: it never uploads, changes or deletes anything.
//
//   node backend/tools/show-snapshots.mjs            local emulator (AzureWebJobsStorage from local.settings.json)
//   node backend/tools/show-snapshots.mjs 5          save the newest 5 (default 3)
//   PROCTOR_STORAGE_CONNECTION="..." node backend/tools/show-snapshots.mjs      any storage account
import { BlobServiceClient } from '@azure/storage-blob';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let conn = process.env.PROCTOR_STORAGE_CONNECTION || process.env.AzureWebJobsStorage;
if (!conn) {
  try { conn = JSON.parse(readFileSync(join(here, '..', 'local.settings.json'), 'utf8')).Values.AzureWebJobsStorage; } catch { /* handled below */ }
}
if (!conn) { console.error('No storage connection found (set PROCTOR_STORAGE_CONNECTION).'); process.exit(1); }

const keep = Number(process.argv[2]) || 3;
const container = BlobServiceClient.fromConnectionString(conn).getContainerClient('proctor-snapshots');
if (!(await container.exists())) { console.log('Container "proctor-snapshots" does not exist yet: no snapshot has been uploaded.'); process.exit(0); }

const items = [];
for await (const b of container.listBlobsFlat({ includeMetadata: true })) items.push(b);
items.sort((a, b) => b.properties.lastModified - a.properties.lastModified);
console.log(`${items.length} snapshot(s) in proctor-snapshots (private container)\n`);
for (const b of items.slice(0, 15)) {
  console.log(`${b.properties.lastModified.toISOString()}  ${String(b.properties.contentLength).padStart(7)} B  ${b.name}  [${b.metadata?.reason ?? '?'}]`);
}
const out = join(tmpdir(), 'aiwb-snapshots');
mkdirSync(out, { recursive: true });
const saved = [];
for (const b of items.slice(0, keep)) {
  const file = join(out, b.name.replace(/\//g, '_'));
  writeFileSync(file, await container.getBlobClient(b.name).downloadToBuffer());
  saved.push(file);
}
console.log(saved.length ? `\nSaved the newest ${saved.length} to:\n  ${saved.join('\n  ')}` : '\nNothing to save yet.');
