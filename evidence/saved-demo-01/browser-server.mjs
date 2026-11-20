// AI-authored browser QA harness; records stay in ignored local/, not this folder.
import { fileURLToPath } from 'node:url';
import { startSavedDemo } from '../../src/persistent-demo.mjs';
const app = await startSavedDemo({ port: 4319,
    directory: fileURLToPath(new URL('../../local/synthetic-web-qa/saved-demo-01/', import.meta.url)),
    fresh: process.argv.includes('--new-session') });
console.log(`Saved synthetic QA: ${app.url}`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
});
