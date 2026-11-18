// AI-authored laptop demo. Everything resets when this process stops.
import { startDemoServer } from '../src/demo-server.mjs';
const app = await startDemoServer({ port: 4318 });
console.log(`FingerRoll 가상 출석 화면: ${app.url}`);
console.log('실제 학생·센서·메시지 없음. 가상 시계 18:24:00부터 진행. 종료: Ctrl+C.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
});
