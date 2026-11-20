// AI-authored synthetic tests. No transport or real student data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openAttendanceStore } from '../src/daily-attendance.mjs';
import { createNotificationPreview } from '../src/notification-preview.mjs';
import { startDemoServer } from '../src/demo-server.mjs';

const day = '2026-11-18';
const at = time => `${day}T${time}+09:00`;
function fixture(t) {
    const store = openAttendanceStore(':memory:'); t.after(() => store.close());
    const ids = ['S001', 'S002', 'S003', 'S004'];
    const snapshot = (time, expectedStudentIds = ids) => store.getRosterSummary({ attendanceDate: day, expectedStudentIds, asOf: at(time) });
    const preview = time => createNotificationPreview(snapshot(time));
    const reason = (studentId, reasonCode = 'reported_reason', expectedReviewId = 0) => store.recordReview({
        attendanceDate: day, studentId, reviewerId: 'DEMO_OPERATOR', reviewedAt: at('18:24:00'),
        action: 'confirm_reason', reasonCode, expectedReviewId,
    });
    return { store, snapshot, preview, reason };
}
test('before 18:25 the preview discloses no candidate IDs or message', t => {
    const f = fixture(t); const preview = f.preview('18:24:59.999');
    assert.equal(preview.phase, 'before_review');
    assert.deepEqual(preview.candidateIds, []); assert.equal(preview.message, null);
});
test('at 18:25 the unconfirmed roster becomes a whereabouts-check draft, never a verdict or delivery', t => {
    const f = fixture(t); const preview = f.preview('18:25:00');
    assert.deepEqual(preview.candidateIds, ['S001','S002','S003','S004']);
    assert.equal(preview.phase, 'review_required');
    assert.equal(preview.kind, 'whereabouts_check');
    assert.equal(preview.previewOnly, true); assert.equal(preview.deliveryEnabled, false);
    assert.equal(preview.recipient, null); assert.equal(preview.requiresHumanReview, true);
    assert.match(preview.message, /결석 확정이 아닙니다/);
    assert.match(preview.message, /인식 장애/);
    assert.equal('absent' in preview, false);
});
test('all confirmed-reason categories and recorded late check-ins are excluded without sharing their details', t => {
    const f = fixture(t);
    f.reason('S001', 'reported_reason'); f.reason('S002', 'outing'); f.reason('S003', 'outing_return');
    f.store.recordCheckIn({ studentId: 'S004', recognizedAt: at('18:26:00') });
    const preview = f.preview('18:27:00');
    assert.deepEqual(preview.candidateIds, []); assert.equal(preview.message, null);
    assert.equal(preview.phase, 'nothing_to_check');
    assert.deepEqual(preview.counts, {candidates:0,recorded:1,reasonConfirmedAwaitingCheckIn:3});
    assert.doesNotMatch(JSON.stringify(preview), /DEMO_OPERATOR|reported_reason|outing_return|S001|S002|S003|S004/);
});
test('a scan or a reason confirmation immediately removes an ID from the next draft', t => {
    const f = fixture(t);
    assert.equal(f.preview('18:25:00').candidateIds.length, 4);
    f.store.recordCheckIn({studentId:'S001',recognizedAt:at('18:25:10')});
    f.reason('S002');
    const current=f.preview('18:26:00');
    assert.deepEqual(current.candidateIds,['S003','S004']);
    assert.doesNotMatch(current.message,/S001|S002|DEMO_OPERATOR|reported_reason/);
});
test('clearing a reason restores a no-scan candidate while retaining the audit record', t => {
    const f = fixture(t); const reason=f.reason('S001');
    assert.equal(f.preview('18:25:00').candidateIds.includes('S001'),false);
    f.store.recordReview({attendanceDate:day,studentId:'S001',reviewerId:'DEMO_OPERATOR',
        reviewedAt:at('18:26:00'),action:'clear_reason',expectedReviewId:reason.reviewId});
    assert.equal(f.preview('18:26:00').candidateIds.includes('S001'),true);
    assert.equal(f.store.listReviewHistory({attendanceDate:day,studentId:'S001'}).length,2);
});
test('a preview cannot create attendance or reason history and repeated reads stay read-only', t => {
    const f=fixture(t); const snapshot=f.snapshot('18:25:00');
    const before=JSON.stringify(snapshot);
    assert.deepEqual(createNotificationPreview(snapshot),createNotificationPreview(snapshot));
    assert.equal(JSON.stringify(snapshot),before);
    assert.deepEqual(f.store.listForDate(day),[]);
    for(const studentId of ['S001','S002','S003','S004'])assert.deepEqual(f.store.listReviewHistory({studentId,attendanceDate:day}),[]);
});
test('later timetable periods retain the same daily draft, without additional obligations', t => {
    const f=fixture(t);
    for(const time of ['18:25:00','19:30:00','20:30:00','23:59:59']){
        const preview=f.preview(time);
        assert.equal(preview.kind,'whereabouts_check');
        assert.match(preview.message,/1교시/);assert.doesNotMatch(preview.message,/2교시|3교시/);
        assert.equal(preview.candidateIds.length,4);
    }
});
test('empty expected roster produces no message', t => {
    const f=fixture(t);const preview=createNotificationPreview(f.snapshot('18:25:00',[]));
    assert.equal(preview.message,null);assert.equal(preview.phase,'nothing_to_check');
});
test('historical previews do not include later scans or reason confirmations', t => {
    const f=fixture(t);f.store.recordCheckIn({studentId:'S001',recognizedAt:at('18:26:00')});
    f.store.recordReview({attendanceDate:day,studentId:'S002',reviewerId:'DEMO_OPERATOR',reviewedAt:at('18:27:00'),action:'confirm_reason',reasonCode:'outing',expectedReviewId:0});
    assert.equal(f.preview('18:25:00').candidateIds.length,4);
    assert.deepEqual(f.preview('18:28:00').candidateIds,['S003','S004']);
});
test('snapshot timing mismatches and duplicate candidates fail closed; snapshots are immutable', t => {
    const f=fixture(t);const snapshot=f.snapshot('18:25:00');
    assert.throws(()=>createNotificationPreview({...snapshot,checklistOpen:false}));
    assert.throws(()=>createNotificationPreview({...snapshot,attendanceDate:'2026-11-19'}));
    assert.throws(()=>createNotificationPreview({...snapshot,rows:[snapshot.rows[0],snapshot.rows[0]]}));
    const preview=createNotificationPreview(snapshot);
    assert.throws(()=>preview.candidateIds.push('S005'),TypeError);
    assert.throws(()=>{preview.counts.candidates=0;},TypeError);
    assert.throws(()=>{preview.deliveryEnabled=true;},TypeError);
});
test('HTTP state and preview share a snapshot and reflect changes without exposing excluded IDs', async t => {
    let ticks=0;const app=await startDemoServer({now:()=>ticks});t.after(()=>app.close());
    const state=async()=> (await fetch(app.url+'/api/state')).json();
    const post=async(path,input)=>fetch(app.url+path,{method:'POST',headers:{Origin:app.url,
        'Content-Type':'application/json','X-FingerRoll-Demo':'1','X-FingerRoll-Session':app.sessionId},body:JSON.stringify(input)});
    assert.equal((await state()).notificationPreview.phase,'before_review');
    ticks=60000;
    await post('/api/scan',{studentId:'S001'});
    await post('/api/review',{studentId:'S002',action:'confirm_reason',reasonCode:'reported_reason',expectedReviewId:0});
    const result=await state();const preview=result.notificationPreview;
    assert.equal(preview.asOf,result.summary.asOf);
    assert.equal(preview.attendanceDate,result.summary.attendanceDate);
    assert.deepEqual(preview.candidateIds,['S003','S004']);
    assert.doesNotMatch(JSON.stringify(preview),/S001|S002|reported_reason|DEMO_OPERATOR/);
    assert.equal((await post('/api/send',{recipient:'council',message:preview.message})).status,404);
    assert.equal((await state()).notificationPreview.deliveryEnabled,false);
});
