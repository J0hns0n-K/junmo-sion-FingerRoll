// AI-authored read-only whereabouts-check preview. No delivery or absence verdict.
import { parseTimestamp } from './timestamp.mjs';
import { koreanContext, validateStudentId } from './attendance-rules.mjs';

export function createNotificationPreview(snapshot) {
    if (!Array.isArray(snapshot?.rows)) throw new Error('최신 명단이 필요합니다.');
    const context = koreanContext(parseTimestamp(snapshot.asOf, '미리보기 시각'));
    if (snapshot.attendanceDate !== context.attendanceDate || snapshot.checklistOpen !== context.checklistOpen) {
        throw new Error('명단 날짜와 검토 시각을 다시 확인해주세요.');
    }
    const candidateIds = context.checklistOpen ? snapshot.rows
        .filter(row => row.status === 'unconfirmed' && row.hasAttendance === false && row.reasonConfirmed === false)
        .map(row => row.studentId) : [];
    candidateIds.forEach(id => validateStudentId(id));
    if (new Set(candidateIds).size !== candidateIds.length) throw new Error('미확인 명단이 중복됐습니다.');
    const phase = !context.checklistOpen ? 'before_review' : candidateIds.length ? 'review_required' : 'nothing_to_check';
    return Object.freeze({
        previewOnly: true, deliveryEnabled: false, recipient: null, requiresHumanReview: true,
        kind: 'whereabouts_check', attendanceDate: snapshot.attendanceDate, asOf: snapshot.asOf, phase,
        candidateIds: Object.freeze(candidateIds),
        counts: Object.freeze({ candidates: candidateIds.length,
            recorded: snapshot.rows.filter(row => row.hasAttendance === true).length,
            reasonConfirmedAwaitingCheckIn: snapshot.rows.filter(row => row.hasAttendance === false && row.reasonConfirmed === true).length }),
        message: phase === 'review_required' ? [
            `[가상 데모 · ${snapshot.attendanceDate} 야자 1교시 출석 확인]`,
            `상황 확인이 필요한 가상 학생: ${candidateIds.join(', ')}`,
            '현재 출석 기록과 확인된 사유가 없어 학생이나 사감 선생님을 통한 상황 확인이 필요합니다.',
            '결석 확정이 아닙니다. 누락된 출석·사유와 인식 장애 여부를 먼저 확인해주세요.',
            '검토용 미리보기이며 전송하지 않았습니다.',
        ].join('\n') : null,
    });
}
