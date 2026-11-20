// AI-authored isolated browser QA. No saved user session is opened.
import { startDemoServer } from '../../src/demo-server.mjs';
const app = await startDemoServer({ port: 4320 });
console.log(`Synthetic notification-preview QA: ${app.url}`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
});
