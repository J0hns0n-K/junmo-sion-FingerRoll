// AI-authored laptop demo. Saved synthetic sessions are excluded from Git.
import { fileURLToPath } from 'node:url';
import { startSavedDemo } from '../src/persistent-demo.mjs';
if (process.argv.slice(2).some(value => value !== '--new-session')) throw new Error('지원하는 옵션은 --new-session뿐입니다.');
const app = await startSavedDemo({ port: 4318,
    directory: fileURLToPath(new URL('../local/synthetic-web/', import.meta.url)),
    fresh: process.argv.includes('--new-session') });
console.log(`FingerRoll 가상 출석 화면: ${app.url}`);
console.log('실제 학생·센서·메시지 없음. 가상 기록과 시계를 자동 저장합니다. 종료: Ctrl+C.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
});
