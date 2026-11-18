// AI-authored synthetic roster/reason tests, 2026-11-18 KST.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openAttendanceStore } from '../src/daily-attendance.mjs';

const day = '2026-11-18';
const at = time => `${day}T${time}+09:00`;
const reason = (overrides = {}) => ({ attendanceDate: day, studentId: 'S001', reviewerId: 'OP001',
    reviewedAt: at('18:27:00'), action: 'confirm_reason', reasonCode: 'reported_reason', expectedReviewId: 0, ...overrides });
function memory(t) {
    const store = openAttendanceStore(':memory:');
    t.after(() => store.close());
    return store;
}
function summary(store, time = '18:30:00', expectedStudentIds = ['S001', 'S002']) {
    return store.getRosterSummary({ attendanceDate: day, expectedStudentIds, asOf: at(time) });
}
function checkIn(store, time = '18:26:00', studentId = 'S001') {
    return store.recordCheckIn({ studentId, recognizedAt: at(time) });
}
function waive(store, previous, overrides = {}) {
    return store.recordReview(reason({ action: 'waive_lateness', reasonCode: undefined,
        expectedReviewId: previous.reviewId, reviewedAt: at('18:28:00'), ...overrides }));
}
function fileDatabase(t) {
    const directory = mkdtempSync(join(tmpdir(), 'fingerroll-roster-'));
    const databasePath = join(directory, 'attendance.sqlite');
    t.after(() => {
        for (const suffix of ['', '-journal', '-wal', '-shm']) {
            try { unlinkSync(databasePath + suffix); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        rmdirSync(directory);
    });
    return databasePath;
}

test('18:25 직전에는 대기이고 정각부터 미확인 명단을 제공한다', t => {
    const store = memory(t);
    assert.equal(summary(store, '18:24:59.999').checklistOpen, false);
    assert.equal(summary(store, '18:24:59.999').counts.pending, 2);
    assert.equal(summary(store, '18:24:59.999').unconfirmed.length, 0);
    const result = summary(store, '18:25:00');
    assert.equal(result.checklistOpen, true);
    assert.deepEqual(result.unconfirmed.map(row => row.studentId), ['S001', 'S002']);
    assert.deepEqual(store.listForDate(day), []);
});

test('출석한 학생은 미확인 명단에서 빠진다', t => {
    const store = memory(t);
    checkIn(store, '18:20:00');
    const result = summary(store, '18:25:00');
    assert.equal(result.rows[0].status, 'present');
    assert.deepEqual(result.unconfirmed.map(row => row.studentId), ['S002']);
    assert.equal(result.counts.recorded, 1);
});

test('조회 시각보다 미래의 인식은 과거 명단에 보이지 않는다', t => {
    const store = memory(t);
    checkIn(store);
    assert.equal(summary(store, '18:25:00').rows[0].status, 'unconfirmed');
    assert.equal(summary(store, '18:26:00').rows[0].status, 'review_required');
});

test('사유 확인만으로 출석 완료가 되지 않는다', t => {
    const store = memory(t);
    store.recordReview(reason({ reviewedAt: at('18:15:00') }));
    const result = summary(store, '18:25:00');
    assert.equal(result.rows[0].status, 'reason_confirmed');
    assert.equal(result.rows[0].hasAttendance, false);
    assert.equal(result.rows[0].reasonConfirmedBy, 'OP001');
    assert.equal(result.counts.recorded, 0);
    assert.equal(result.awaitingCheckInWithReason.length, 1);
    assert.deepEqual(result.unconfirmed.map(row => row.studentId), ['S002']);
    assert.equal(store.getAttendance({ studentId: 'S001', attendanceDate: day }), null);
});

test('사유를 미리 확인했어도 늦은 인식에는 명시적 면제가 필요하다', t => {
    const store = memory(t);
    const confirmation = store.recordReview(reason({ reviewedAt: at('18:15:00'), reasonCode: 'outing_return' }));
    checkIn(store);
    assert.equal(summary(store).rows[0].status, 'review_required');
    waive(store, confirmation);
    const row = summary(store).rows[0];
    assert.equal(row.status, 'excused');
    assert.equal(row.exemptionConfirmedBy, 'OP001');
    assert.equal(row.firstRecognizedAt, at('18:26:00'));
    assert.equal(store.getAttendance({ studentId: 'S001', attendanceDate: day }).status, 'review_required');
});

test('면제 뒤 재인식도 원 시각과 확인 결과를 유지한다', t => {
    const store = memory(t);
    const original = checkIn(store);
    const confirmation = store.recordReview(reason());
    waive(store, confirmation);
    const duplicate = checkIn(store, '21:00:00');
    assert.equal(duplicate.created, false);
    assert.deepEqual(duplicate.record, original.record);
    assert.equal(summary(store, '21:00:00').rows[0].status, 'excused');
});

test('사유 취소는 출석을 지우지 않고 면제를 재검토 상태로 돌린다', t => {
    const store = memory(t);
    checkIn(store);
    const confirmation = store.recordReview(reason());
    const exemption = waive(store, confirmation);
    store.recordReview(reason({ action: 'clear_reason', reasonCode: null,
        expectedReviewId: exemption.reviewId, reviewedAt: at('18:29:00') }));
    const row = summary(store).rows[0];
    assert.equal(row.status, 'review_required');
    assert.equal(row.hasAttendance, true);
    assert.equal(row.reasonConfirmed, false);
    assert.equal(row.firstRecognizedAt, at('18:26:00'));
    const history = store.listReviewHistory({ studentId: 'S001', attendanceDate: day });
    assert.deepEqual(history.map(event => event.action), ['confirm_reason', 'waive_lateness', 'clear_reason']);
    assert.equal(history[2].previousReviewId, exemption.reviewId);
});

test('사유가 바뀌면 과거 면제를 자동 재사용하지 않는다', t => {
    const store = memory(t);
    checkIn(store);
    const confirmation = store.recordReview(reason());
    const exemption = waive(store, confirmation);
    store.recordReview(reason({ expectedReviewId: exemption.reviewId,
        reasonCode: 'outing', reviewedAt: at('18:29:00') }));
    assert.equal(summary(store).rows[0].status, 'review_required');
});

test('출석 없는 학생은 지각 면제만으로 출석 처리할 수 없다', t => {
    const store = memory(t);
    const confirmation = store.recordReview(reason());
    assert.throws(() => waive(store, confirmation), /출석 기록/);
    assert.equal(store.listForDate(day).length, 0);
    assert.equal(store.listReviewHistory({ studentId: 'S001', attendanceDate: day }).length, 1);
});

test('정상 출석에는 지각 면제 처리를 만들지 않는다', t => {
    const store = memory(t);
    checkIn(store, '18:20:00');
    const confirmation = store.recordReview(reason());
    assert.throws(() => waive(store, confirmation), /출석 기록/);
    assert.equal(summary(store).rows[0].status, 'present');
});

test('사유 확인 없이 지각 면제를 기록할 수 없다', t => {
    const store = memory(t);
    checkIn(store);
    assert.throws(() => waive(store, { reviewId: 0 }), /사유 확인/);
    assert.equal(store.listReviewHistory({ studentId: 'S001', attendanceDate: day }).length, 0);
});

test('출석보다 앞선 면제 시각을 거부한다', t => {
    const store = memory(t);
    const confirmation = store.recordReview(reason({ reviewedAt: at('18:15:00') }));
    checkIn(store);
    assert.throws(() => waive(store, confirmation, { reviewedAt: at('18:20:00') }), /출석보다 이전/);
});

test('낡은 명단에서의 수정은 거부하고 저장소는 계속 사용 가능하다', t => {
    const store = memory(t);
    checkIn(store);
    const confirmation = store.recordReview(reason());
    assert.throws(() => waive(store, { reviewId: 0 }), { code: 'STALE_REVIEW' });
    waive(store, confirmation);
    assert.equal(summary(store).rows[0].status, 'excused');
});

test('확인 이력을 과거 시각으로 되돌려 추가할 수 없다', t => {
    const store = memory(t);
    const confirmation = store.recordReview(reason());
    assert.throws(() => store.recordReview(reason({ expectedReviewId: confirmation.reviewId,
        reviewedAt: at('18:26:00') })), /과거 시각/);
    assert.equal(store.listReviewHistory({ studentId: 'S001', attendanceDate: day }).length, 1);
});

test('과거 시점 조회에는 이후 사유 확인이나 면제가 섞이지 않는다', t => {
    const store = memory(t);
    checkIn(store);
    const confirmation = store.recordReview(reason());
    waive(store, confirmation);
    assert.equal(summary(store, '18:25:00').rows[0].hasAttendance, false);
    assert.equal(summary(store, '18:26:00').rows[0].reasonConfirmed, false);
    assert.equal(summary(store, '18:27:00').rows[0].status, 'review_required');
    assert.equal(summary(store, '18:28:00').rows[0].status, 'excused');
});

test('다음 날 명단에 전날 사유가 넘어가지 않는다', t => {
    const store = memory(t);
    store.recordReview(reason());
    const result = store.getRosterSummary({ attendanceDate: '2026-11-19',
        expectedStudentIds: ['S001'], asOf: '2026-11-19T18:25:00+09:00' });
    assert.equal(result.rows[0].status, 'unconfirmed');
    assert.equal(result.rows[0].reviewId, 0);
});

test('UTC로 조회해도 한국 정각에 명단이 열린다', t => {
    const store = memory(t);
    assert.equal(store.getRosterSummary({ attendanceDate: day, expectedStudentIds: ['S001'],
        asOf: '2026-11-18T09:25:00Z' }).checklistOpen, true);
});

test('명단 밖 기록을 명단 학생으로 추가하지 않는다', t => {
    const store = memory(t);
    checkIn(store, '18:20:00', 'S999');
    assert.deepEqual(summary(store).rows.map(row => row.studentId), ['S001', 'S002']);
    assert.equal(summary(store).counts.recorded, 0);
    assert.equal(summary(store, '18:30:00', []).counts.expected, 0);
});

test('잘못된 명단과 날짜를 거부한다', t => {
    const store = memory(t);
    for (const input of [
        { expectedStudentIds: ['S001', 'S001'] }, { expectedStudentIds: ['실명'] },
        { expectedStudentIds: null }, { asOf: '2026-11-19T18:25:00+09:00' },
        { asOf: '2026-11-18T18:25:00' }, { attendanceDate: '2026-02-29' },
    ]) assert.throws(() => store.getRosterSummary({ attendanceDate: day,
        expectedStudentIds: ['S001'], asOf: at('18:30:00'), ...input }));
});

for (const [name, overrides] of [
    ['상세 메모', { note: 'do-not-store-this-text' }],
    ['허용되지 않은 사유', { reasonCode: 'free-text-reason' }],
    ['허용되지 않은 작업', { action: 'mark_absent' }],
    ['확인자 누락', { reviewerId: undefined }],
    ['다른 한국 날짜', { reviewedAt: '2026-11-19T00:00:00+09:00' }],
    ['이력 번호 누락', { expectedReviewId: undefined }],
]) {
    test(`잘못된 확인 입력은 저장하지 않는다: ${name}`, t => {
        const store = memory(t);
        assert.throws(() => store.recordReview(reason(overrides)));
        assert.equal(store.listReviewHistory({ studentId: 'S001', attendanceDate: day }).length, 0);
    });
}

test('반환된 명단과 이력을 수정해 저장 내용을 바꿀 수 없다', t => {
    const store = memory(t);
    store.recordReview(reason());
    const result = summary(store);
    assert.throws(() => { result.rows[0].status = 'present'; }, TypeError);
    assert.throws(() => result.unconfirmed.push({}), TypeError);
    const history = store.listReviewHistory({ studentId: 'S001', attendanceDate: day });
    assert.throws(() => { history[0].reasonCode = 'outing'; }, TypeError);
});

test('닫힌 저장소에서는 명단과 사유 API도 거부한다', () => {
    const store = openAttendanceStore(':memory:');
    store.close();
    assert.throws(() => summary(store), /닫혔/);
    assert.throws(() => store.recordReview(reason()), /닫혔/);
    assert.throws(() => store.listReviewHistory({ attendanceDate: day, studentId: 'S001' }), /닫혔/);
});

test('재개방해도 원 출석과 사유 이력·면제가 유지된다', t => {
    const databasePath = fileDatabase(t);
    let store = openAttendanceStore(databasePath);
    try {
        checkIn(store);
        const confirmation = store.recordReview(reason());
        waive(store, confirmation);
    } finally { store.close(); }
    store = openAttendanceStore(databasePath);
    try {
        assert.equal(summary(store).rows[0].status, 'excused');
        assert.equal(summary(store).rows[0].firstRecognizedAt, at('18:26:00'));
        assert.equal(store.listReviewHistory({ studentId: 'S001', attendanceDate: day }).length, 2);
    } finally { store.close(); }
});

test('기존 출석 테이블 파일에 확인 이력 기능을 추가해도 기존 기록은 유지된다', t => {
    const databasePath = fileDatabase(t);
    const old = new DatabaseSync(databasePath);
    try {
        old.exec(`CREATE TABLE daily_attendance (
            student_id TEXT NOT NULL, attendance_date TEXT NOT NULL,
            first_recognized_at TEXT NOT NULL, first_recognized_at_utc TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('present', 'review_required')),
            PRIMARY KEY (attendance_date, student_id)) STRICT;`);
        old.prepare('INSERT INTO daily_attendance VALUES (?, ?, ?, ?, ?)')
            .run('S001', day, at('18:26:00'), '2026-11-18T09:26:00.000Z', 'review_required');
    } finally { old.close(); }
    const store = openAttendanceStore(databasePath);
    try {
        const confirmation = store.recordReview(reason());
        waive(store, confirmation);
        assert.equal(summary(store).rows[0].status, 'excused');
        assert.equal(store.listForDate(day).length, 1);
    } finally { store.close(); }
});

test('동시 사유 수정에서는 한 요청만 성공하고 다른 요청은 재확인을 요구한다', async t => {
    const databasePath = fileDatabase(t);
    const store = openAttendanceStore(databasePath);
    let initial;
    try { checkIn(store); initial = store.recordReview(reason()); } finally { store.close(); }
    const moduleUrl = new URL('../src/daily-attendance.mjs', import.meta.url).href;
    const script = `
        import {openAttendanceStore} from ${JSON.stringify(moduleUrl)};
        const store=openAttendanceStore(process.argv[1]);
        try {
            try { const event=store.recordReview(JSON.parse(process.argv[2])); console.log(JSON.stringify({ok:true,event})); }
            catch(error) { console.log(JSON.stringify({ok:false,code:error.code,message:error.message})); }
        } finally { store.close(); }
    `;
    const jobs = ['OP001', 'OP002'].map(reviewerId => new Promise((resolve, reject) => {
        const input = reason({ action: 'waive_lateness', reasonCode: undefined, reviewerId,
            expectedReviewId: initial.reviewId, reviewedAt: at('18:28:00') });
        const child = spawn(process.execPath, ['--input-type=module', '-e', script, databasePath, JSON.stringify(input)], { windowsHide: true });
        let stdout = '', stderr = '';
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr += data; });
        child.once('error', reject);
        child.once('close', code => {
            if (code !== 0) return reject(new Error(stderr));
            try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
        });
    }));
    const settled = await Promise.allSettled(jobs);
    const failure = settled.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    const results = settled.map(result => result.value);
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.equal(results.filter(result => result.code === 'STALE_REVIEW').length, 1);
    const reopened = openAttendanceStore(databasePath);
    try {
        assert.equal(summary(reopened).rows[0].status, 'excused');
        assert.equal(reopened.listReviewHistory({ studentId: 'S001', attendanceDate: day }).length, 2);
    } finally { reopened.close(); }
});
