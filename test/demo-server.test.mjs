// AI-authored HTTP integration tests using only the in-memory fake roster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startDemoServer } from '../src/demo-server.mjs';

async function fixture(t) {
    let ticks = 0;
    const app = await startDemoServer({ now: () => ticks });
    t.after(() => app.close());
    const raw = (path, options) => fetch(app.url + path, options);
    const post = (path, body, headers = {}) => raw(path, { method: 'POST', headers: {
        Origin: app.url, 'Content-Type': 'application/json', 'X-FingerRoll-Demo': '1', ...headers,
    }, body: JSON.stringify(body) });
    const state = async () => (await raw('/api/state')).json();
    const advance = ms => { ticks += ms; };
    return { ...app, raw, post, state, advance };
}
test('demo serves local assets with restrictive headers and no external scripts', async t => {
    const f = await fixture(t);
    for (const path of ['/', '/app.js', '/style.css']) {
        const response = await f.raw(path);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        assert.doesNotMatch(await response.text(), /https?:\/\//);
    }
});
test('18:25 checklist opens with elapsed server demo time, without a write', async t => {
    const f = await fixture(t);
    assert.equal((await f.state()).summary.counts.pending, 4);
    f.advance(59999);
    assert.equal((await f.state()).summary.checklistOpen, false);
    f.advance(1);
    const current = await f.state();
    assert.equal(current.syntheticOnly, true);
    assert.equal(current.summary.checklistOpen, true);
    assert.equal(current.summary.counts.unconfirmed, 4);
});
test('scan uses server time and repeats preserve the original record', async t => {
    const f = await fixture(t);
    const first = await (await f.post('/api/scan', { studentId: 'S001' })).json();
    assert.equal(first.result.created, true);
    assert.equal(first.result.record.status, 'present');
    f.advance(100000);
    const repeat = await (await f.post('/api/scan', { studentId: 'S001' })).json();
    assert.equal(repeat.result.created, false);
    assert.deepEqual(repeat.result.record, first.result.record);
    assert.equal(repeat.summary.counts.recorded, 1);
});
test('exact 18:25 is on time and the following millisecond requires review', async t => {
    const f = await fixture(t); f.advance(60000);
    assert.equal((await (await f.post('/api/scan', { studentId: 'S001' })).json()).result.record.status, 'present');
    f.advance(1);
    assert.equal((await (await f.post('/api/scan', { studentId: 'S002' })).json()).result.record.status, 'review_required');
});
test('a confirmed reason does not fabricate a check-in', async t => {
    const f = await fixture(t);
    const response = await f.post('/api/review', { studentId: 'S002', action: 'confirm_reason', reasonCode: 'reported_reason', expectedReviewId: 0 });
    assert.equal(response.status, 200);
    const { summary, result } = await response.json();
    assert.equal(summary.counts.recorded, 0);
    assert.equal(summary.counts.reasonConfirmedAwaitingCheckIn, 1);
    assert.equal(result.reviewerId, 'DEMO_OPERATOR');
});
test('late waiver is explicit, audited and keeps the scan time; clearing reverses the exemption', async t => {
    const f = await fixture(t); f.advance(70000);
    const scan = await (await f.post('/api/scan', { studentId: 'S003' })).json();
    assert.equal((await f.post('/api/review', { studentId: 'S003', action: 'waive_lateness', expectedReviewId: 0 })).status, 400);
    const reason = await (await f.post('/api/review', { studentId: 'S003', action: 'confirm_reason', reasonCode: 'outing_return', expectedReviewId: 0 })).json();
    assert.equal(reason.summary.rows[2].status, 'review_required');
    const waived = await (await f.post('/api/review', { studentId: 'S003', action: 'waive_lateness', expectedReviewId: reason.result.reviewId })).json();
    assert.equal(waived.summary.rows[2].status, 'excused');
    assert.equal(waived.summary.rows[2].firstRecognizedAt, scan.result.record.firstRecognizedAt);
    const cleared = await (await f.post('/api/review', { studentId: 'S003', action: 'clear_reason', expectedReviewId: waived.result.reviewId })).json();
    assert.equal(cleared.summary.rows[2].status, 'review_required');
    const history = await (await f.raw('/api/history?studentId=S003')).json();
    assert.deepEqual(history.map(event => event.action), ['confirm_reason', 'waive_lateness', 'clear_reason']);
});
test('stale review returns conflict and preserves the first review', async t => {
    const f = await fixture(t);
    const input = { studentId: 'S001', action: 'confirm_reason', reasonCode: 'outing', expectedReviewId: 0 };
    await f.post('/api/review', input);
    const response = await f.post('/api/review', input);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'STALE_REVIEW');
    assert.equal((await (await f.raw('/api/history?studentId=S001')).json()).length, 1);
});
test('unknown students, injected time/identity and detailed reasons are rejected', async t => {
    const f = await fixture(t);
    for (const input of [{ studentId: 'REAL001' }, { studentId: 'S001', recognizedAt: '2026-11-18T01:00:00+09:00' }]) {
        assert.equal((await f.post('/api/scan', input)).status, 400);
    }
    const base = { studentId: 'S001', action: 'confirm_reason', reasonCode: 'outing', expectedReviewId: 0 };
    for (const extra of [{ note: 'synthetic detail' }, { reviewerId: 'OTHER' }, { reviewedAt: '2026-11-18T18:00:00+09:00' }]) {
        assert.equal((await f.post('/api/review', { ...base, ...extra })).status, 400);
    }
    assert.equal((await f.state()).summary.counts.recorded, 0);
});
test('foreign and missing origins, missing header, and incorrect content type cannot mutate', async t => {
    const f = await fixture(t);
    for (const headers of [{ Origin: 'https://example.invalid' }, { Origin: '' }, { 'X-FingerRoll-Demo': '' }, { 'Content-Type': 'text/plain' }]) {
        assert.equal((await f.post('/api/scan', { studentId: 'S001' }, headers)).status, 403);
    }
    assert.equal((await f.raw('/api/state', { headers: { Origin: 'https://example.invalid' } })).status, 403);
    assert.equal((await f.state()).summary.counts.recorded, 0);
});
test('forged Host and unsupported requests are rejected', async t => {
    const f = await fixture(t);
    // Native http permits a forged Host header for this DNS-rebinding guard test.
    const { request } = await import('node:http');
    const status = await new Promise((resolve, reject) => {
        const req = request(f.url + '/api/state', { headers: { Host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
        req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
    assert.equal((await f.raw('/api/state', { method: 'OPTIONS' })).status, 405);
    assert.equal((await f.raw('/missing')).status, 404);
    assert.equal((await f.post('/api/send', {})).status, 404);
    assert.equal((await f.raw('/api/history?studentId=S001&studentId=S002')).status, 404);
});
test('malformed, oversized and non-object JSON are rejected', async t => {
    const f = await fixture(t);
    const headers = { Origin: f.url, 'Content-Type': 'application/json', 'X-FingerRoll-Demo': '1' };
    assert.equal((await f.raw('/api/scan', { method: 'POST', headers, body: '{' })).status, 400);
    assert.equal((await f.raw('/api/scan', { method: 'POST', headers, body: ' '.repeat(4097) })).status, 413);
    for (const input of [null, [], 'S001', 1]) assert.equal((await f.post('/api/scan', input)).status, 400);
});
test('demo time advances only forward and remains within its synthetic day', async t => {
    const f = await fixture(t);
    for (const value of [0, -1, 1.5, 3601, '60']) assert.equal((await f.post('/api/clock', { advanceSeconds: value })).status, 400);
    const advanced = await (await f.post('/api/clock', { advanceSeconds: 60 })).json();
    assert.equal(advanced.summary.asOf, '2026-11-18T09:25:00.000Z');
    f.advance(86400000);
    const last = await f.state();
    assert.equal(last.clockRunning, false);
    assert.equal(last.summary.asOf, '2026-11-18T14:59:59.999Z');
});
test('a fresh server starts with no records or reason history', async t => {
    const first = await fixture(t); await first.post('/api/scan', { studentId: 'S001' });
    const second = await fixture(t);
    assert.equal((await second.state()).summary.counts.recorded, 0);
    assert.deepEqual(await (await second.raw('/api/history?studentId=S001')).json(), []);
});
