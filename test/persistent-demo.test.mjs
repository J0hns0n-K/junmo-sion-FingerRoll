// AI-authored restart/retention checks. Only disposable synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startSavedDemo } from '../src/persistent-demo.mjs';
import { openAttendanceStore } from '../src/daily-attendance.mjs';
import { openDemoClock } from '../src/demo-clock.mjs';

async function workspace(t) {
    const directory = await mkdtemp(join(tmpdir(), 'fingerroll-saved-demo-'));
    const running = [];
    t.after(async () => {
        await Promise.all(running.map(app => app.close()));
        // Unique test directory; remove files only, never recurse through other paths.
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            assert.equal(entry.isFile(), true);
            await unlink(join(directory, entry.name));
        }
        await rmdir(directory);
    });
    return { directory, async start(options = {}) {
        const app = await startSavedDemo({ directory, now: () => 0, ...options });
        running.push(app); return app;
    } };
}
const state = async app => (await fetch(app.url + '/api/state')).json();
const post = async (app, path, input, session = app.sessionId) => {
    const response = await fetch(app.url + path, { method: 'POST', headers: {
        Origin: app.url, 'Content-Type': 'application/json', 'X-FingerRoll-Demo': '1', 'X-FingerRoll-Session': session,
    }, body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
};
test('restart resumes check-ins, reason history, waiver, session identity and simulated time', async t => {
    const w = await workspace(t); const first = await w.start();
    await post(first, '/api/scan', { studentId: 'S001' });
    await post(first, '/api/clock', { advanceSeconds: 120 });
    const scan = await post(first, '/api/scan', { studentId: 'S003' });
    const reason = await post(first, '/api/review', { studentId: 'S003', action: 'confirm_reason', reasonCode: 'outing_return', expectedReviewId: 0 });
    await post(first, '/api/review', { studentId: 'S003', action: 'waive_lateness', expectedReviewId: reason.body.result.reviewId });
    await post(first, '/api/review', { studentId: 'S002', action: 'confirm_reason', reasonCode: 'reported_reason', expectedReviewId: 0 });
    const before = await state(first);
    await first.close();
    const second = await w.start(); const after = await state(second);
    assert.equal(after.persistent, true);
    assert.equal(second.sessionId, first.sessionId);
    assert.equal(second.databasePath, first.databasePath);
    assert.deepEqual(after.summary, before.summary);
    assert.equal(after.summary.rows[2].firstRecognizedAt, scan.body.result.record.firstRecognizedAt);
    assert.equal(after.summary.rows[2].status, 'excused');
    assert.equal(after.summary.rows[1].hasAttendance, false);
    assert.equal(after.summary.rows[3].status, 'unconfirmed');
    assert.equal((await (await fetch(second.url + '/api/history?studentId=S003')).json()).length, 2);
    const repeat = await post(second, '/api/scan', { studentId: 'S001' });
    assert.equal(repeat.body.result.created, false);
    assert.equal(repeat.body.result.record.firstRecognizedAt, before.summary.rows[0].firstRecognizedAt);
});
test('new practice keeps the prior database and rejects the prior browser session', async t => {
    const w = await workspace(t); const first = await w.start();
    await post(first, '/api/scan', { studentId: 'S001' });
    await post(first, '/api/clock', { advanceSeconds: 120 });
    await first.close();
    const original = await readFile(first.databasePath);
    const second = await w.start({ fresh: true });
    assert.notEqual(second.sessionId, first.sessionId);
    assert.notEqual(second.databasePath, first.databasePath);
    assert.deepEqual(await readFile(first.databasePath), original);
    assert.equal((await state(second)).summary.counts.recorded, 0);
    assert.equal((await post(second, '/api/scan', { studentId: 'S001' }, first.sessionId)).status, 409);
    assert.equal((await state(second)).summary.counts.recorded, 0);
    const previous = (await readdir(w.directory)).filter(file => file.startsWith('previous-'));
    assert.equal(previous.length, 1);
    assert.equal(JSON.parse(await readFile(join(w.directory, previous[0]), 'utf8')).databaseFile, first.databasePath.split(/[\\/]/).at(-1));
    const old = openAttendanceStore(first.databasePath);
    try { assert.equal(old.listForDate('2026-11-18').length, 1); } finally { old.close(); }
});
test('process exit without close still retains committed records and their clock checkpoint', async t => {
    const w = await workspace(t);
    const moduleUrl = new URL('../src/persistent-demo.mjs', import.meta.url).href;
    const script = `import {startSavedDemo} from ${JSON.stringify(moduleUrl)};
        const app=await startSavedDemo({directory:process.argv[1],now:()=>0});
        const send=(path,body)=>fetch(app.url+path,{method:'POST',headers:{Origin:app.url,'Content-Type':'application/json','X-FingerRoll-Demo':'1','X-FingerRoll-Session':app.sessionId},body:JSON.stringify(body)});
        await send('/api/clock',{advanceSeconds:120});
        const response=await send('/api/scan',{studentId:'S003'});
        const result=await response.json();
        if(response.status!==200 || !result.result.created)process.exit(2);
        process.exit(0);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, w.directory], { windowsHide: true, timeout: 15000 });
    assert.equal(child.status, 0, child.stderr.toString());
    const app = await w.start(); const restored = await state(app);
    assert.equal(restored.summary.asOf, '2026-11-18T09:26:00.000Z');
    assert.equal(restored.summary.rows[2].status, 'review_required');
    assert.equal(restored.summary.rows[2].firstRecognizedAtUtc, restored.summary.asOf);
});
test('clock progress on a read and graceful close both survive reopening; downtime is paused', async t => {
    const w = await workspace(t); let tick = 0;
    const first = await w.start({ now: () => tick });
    tick = 90000;
    assert.equal((await state(first)).summary.checklistOpen, true);
    tick = 100000; await first.close();
    const second = await w.start({ now: () => 5000000 });
    assert.equal((await state(second)).summary.asOf, '2026-11-18T09:25:40.000Z');
});
test('failed new-session startup leaves the active pointer and prior records unchanged', async t => {
    const w = await workspace(t); const first = await w.start();
    await post(first, '/api/scan', { studentId: 'S001' });
    const pointer = await readFile(join(w.directory, 'active.json'));
    await assert.rejects(w.start({ fresh: true, port: Number(new URL(first.url).port) }), { code: 'EADDRINUSE' });
    assert.deepEqual(await readFile(join(w.directory, 'active.json')), pointer);
    assert.equal((await state(first)).summary.counts.recorded, 1);
});
test('invalid, path-traversing or missing-file pointers fail without resetting stored inputs', async t => {
    const w = await workspace(t); const first = await w.start(); await first.close();
    const pointer = join(w.directory, 'active.json');
    for (const text of ['{', JSON.stringify({version:1,databaseFile:'../../other.sqlite'}), JSON.stringify({version:1,databaseFile:'session-00000000-0000-0000-0000-000000000000.sqlite'})]) {
        await writeFile(pointer, text);
        await assert.rejects(w.start());
        assert.equal(await readFile(pointer, 'utf8'), text);
    }
});
test('clock checkpoints never move backwards when the supplied elapsed clock regresses', async t => {
    const w = await workspace(t); let tick = 0;
    const app = await w.start({now:()=>tick});
    tick = 70000; const before = await state(app);
    tick = 100; const after = await state(app);
    assert.equal(after.summary.asOf, before.summary.asOf);
});
test('an existing non-demo database is rejected without adding demo metadata', async t => {
    const w = await workspace(t); const database = join(w.directory, 'legacy.sqlite');
    const store = openAttendanceStore(database); store.close();
    const original = await readFile(database);
    assert.throws(() => openDemoClock(database, () => 0));
    assert.deepEqual(await readFile(database), original);
});
