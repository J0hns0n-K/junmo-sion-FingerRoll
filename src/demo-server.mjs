// AI-authored, loopback-only synthetic UI. No sensor, real roster or messaging.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { openAttendanceStore } from './daily-attendance.mjs';
import { openDemoClock } from './demo-clock.mjs';

const day = '2026-11-18';
const ids = Object.freeze(['S001', 'S002', 'S003', 'S004']);
const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export async function startDemoServer({ port = 0, now = () => performance.now(), databasePath = ':memory:' } = {}) {
    const staticFiles = new Map(await Promise.all([...assets].map(async ([route, [file, type]]) =>
        [route, { body: await readFile(new URL(`../web/${file}`, import.meta.url)), type }])));
    const clock = openDemoClock(databasePath, now);
    let store;
    try { store = openAttendanceStore(databasePath); }
    catch (error) { clock.close(); throw error; }
    const timestamp = () => new Date(clock.checkpoint()).toISOString();
    const summary = () => ({ syntheticOnly: true, sessionId: clock.sessionId, persistent: databasePath !== ':memory:',
        clockRunning: clock.running,
        summary: store.getRosterSummary({ attendanceDate: day, expectedStudentIds: ids, asOf: timestamp() }) });
    let origin;
    function fail(message, status = 400, code) { throw Object.assign(new Error(message), { status, code }); }
    function fields(value, allowed) {
        if (!value || Array.isArray(value) || typeof value !== 'object' ||
            Object.keys(value).some(key => !allowed.includes(key))) fail('허용되지 않은 입력입니다.');
    }
    function student(value) { if (!ids.includes(value)) fail('가상 명단의 학생을 선택해주세요.'); }
    const server = createServer(async (request, response) => {
        const send = (status, body, type = 'application/json; charset=utf-8') => {
            response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
                'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
            response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
        };
        try {
            if (request.headers.host !== new URL(origin).host) fail('이 노트북의 데모 주소로 접속해주세요.', 403);
            if (request.headers.origin && request.headers.origin !== origin) fail('다른 사이트의 요청은 허용하지 않습니다.', 403);
            const url = new URL(request.url, origin);
            if (request.method === 'GET') {
                if (staticFiles.has(url.pathname) && !url.search) {
                    const file = staticFiles.get(url.pathname);
                    return send(200, file.body, file.type);
                }
                if (url.pathname === '/api/state' && !url.search) return send(200, summary());
                if (url.pathname === '/api/history' && [...url.searchParams.keys()].length === 1) {
                    const studentId = url.searchParams.get('studentId');
                    student(studentId);
                    return send(200, store.listReviewHistory({ studentId, attendanceDate: day }));
                }
                return send(404, { error: '없는 페이지입니다.' });
            }
            if (request.method !== 'POST') return send(405, { error: '지원하지 않는 요청입니다.' });
            if (request.headers.origin !== origin || request.headers['x-fingerroll-demo'] !== '1' ||
                request.headers['content-type'] !== 'application/json') fail('데모 화면에서 다시 시도해주세요.', 403);
            if (request.headers['x-fingerroll-session'] !== clock.sessionId) {
                fail('연습 세션이 바뀌었습니다. 최신 화면을 확인한 뒤 다시 시도해주세요.', 409, 'STALE_SESSION');
            }
            if (!['/api/scan', '/api/review', '/api/clock'].includes(url.pathname) || url.search) {
                return send(404, { error: '없는 기능입니다.' });
            }
            const chunks = [];
            let length = 0;
            for await (const chunk of request) {
                length += chunk.length;
                if (length > 4096) fail('입력이 너무 큽니다.', 413);
                chunks.push(chunk);
            }
            let input;
            try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { fail('입력 형식을 확인해주세요.'); }
            let result;
            if (url.pathname === '/api/clock') {
                fields(input, ['advanceSeconds']);
                if (!Number.isSafeInteger(input.advanceSeconds) || input.advanceSeconds < 1 || input.advanceSeconds > 3600) {
                    fail('가상 시계는 1~3600초 앞으로만 이동할 수 있습니다.');
                }
                clock.advance(input.advanceSeconds);
            } else if (url.pathname === '/api/scan') {
                fields(input, ['studentId']);
                student(input.studentId);
                result = store.recordCheckIn({ studentId: input.studentId, recognizedAt: timestamp() });
            } else {
                fields(input, ['studentId', 'action', 'reasonCode', 'expectedReviewId']);
                student(input.studentId);
                result = store.recordReview({ ...input, attendanceDate: day, reviewerId: 'DEMO_OPERATOR', reviewedAt: timestamp() });
            }
            return send(200, { ...summary(), result });
        } catch (error) {
            send(error.code === 'STALE_REVIEW' ? 409 : error.status ?? 400,
                { error: error.message, ...(['STALE_REVIEW', 'STALE_SESSION'].includes(error.code) ? { code: error.code } : {}) });
        }
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', resolve);
        });
        origin = `http://127.0.0.1:${server.address().port}`;
    } catch (error) { store.close(); clock.close(); throw error; }
    let closing;
    return { url: origin, sessionId: clock.sessionId, close() {
        return closing ??= (async () => {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            try { store.close(); } finally { clock.close(); }
        })();
    } };
}
