// AI-authored projection and review validation. Synthetic prototype; not authorization.
import { parseTimestamp } from './timestamp.mjs';
import { koreanContext, validateDate, validateStudentId } from './attendance-rules.mjs';

const actions = new Set(['confirm_reason', 'waive_lateness', 'clear_reason']);
const reasons = new Set(['reported_reason', 'outing', 'outing_return']);
const reviewKeys = new Set(['attendanceDate', 'studentId', 'reviewerId', 'reviewedAt', 'action', 'reasonCode', 'expectedReviewId']);

export function validateReview(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !reviewKeys.has(key))) {
        throw new Error('허용된 최소 사유 확인 항목만 전달해주세요.');
    }
    const { attendanceDate, studentId, reviewerId, reviewedAt, action, reasonCode, expectedReviewId } = input;
    validateDate(attendanceDate);
    validateStudentId(studentId);
    validateStudentId(reviewerId, '확인자 ID');
    const milliseconds = parseTimestamp(reviewedAt, '확인 시각');
    if (koreanContext(milliseconds).attendanceDate !== attendanceDate) throw new Error('확인 시각의 한국 날짜가 일치하지 않습니다.');
    if (!actions.has(action)) throw new Error('사유 확인 작업이 올바르지 않습니다.');
    if (!Number.isSafeInteger(expectedReviewId) || expectedReviewId < 0) throw new Error('현재 확인 이력 번호가 필요합니다.');
    if ((action === 'confirm_reason' && !reasons.has(reasonCode))
        || (action !== 'confirm_reason' && reasonCode !== undefined && reasonCode !== null)) {
        throw new Error('정해진 최소 사유 구분만 사용할 수 있습니다.');
    }
    return { attendanceDate, studentId, reviewerId, reviewedAt, action,
        reasonCode: action === 'confirm_reason' ? reasonCode : null, expectedReviewId, milliseconds };
}

export function reviewFromRow(row) {
    return Object.freeze({
        reviewId: row.review_id, previousReviewId: row.previous_review_id,
        attendanceDate: row.attendance_date, studentId: row.student_id,
        reviewerId: row.reviewer_id, reviewedAt: row.reviewed_at, reviewedAtUtc: row.reviewed_at_utc,
        action: row.action, reasonCode: row.reason_code,
        attendanceReferenceUtc: row.attendance_reference_utc,
    });
}

export function reviewState(events) {
    let reason = null, exemption = null;
    for (const event of events) {
        if (event.action === 'confirm_reason') { reason = event; exemption = null; }
        if (event.action === 'clear_reason') { reason = null; exemption = null; }
        if (event.action === 'waive_lateness') exemption = event;
    }
    return { reason, exemption };
}

export function validateRosterRequest({ attendanceDate, expectedStudentIds, asOf } = {}) {
    validateDate(attendanceDate);
    if (!Array.isArray(expectedStudentIds) || expectedStudentIds.length > 10000) throw new Error('가명 학생 ID 명단을 전달해주세요.');
    for (const studentId of expectedStudentIds) validateStudentId(studentId);
    if (new Set(expectedStudentIds).size !== expectedStudentIds.length) throw new Error('명단의 학생 ID가 중복됐습니다.');
    const milliseconds = parseTimestamp(asOf, '조회 시각');
    const context = koreanContext(milliseconds);
    if (context.attendanceDate !== attendanceDate) throw new Error('조회 시각의 한국 날짜가 일치하지 않습니다.');
    return { attendanceDate, expectedStudentIds: [...expectedStudentIds], asOf, milliseconds, checklistOpen: context.checklistOpen };
}

export function projectRoster(request, records, events) {
    const recordsByStudent = new Map(records
        .filter(record => Date.parse(record.firstRecognizedAtUtc) <= request.milliseconds)
        .map(record => [record.studentId, record]));
    const eventsByStudent = new Map();
    for (const event of events) {
        if (Date.parse(event.reviewedAtUtc) > request.milliseconds) continue;
        if (!eventsByStudent.has(event.studentId)) eventsByStudent.set(event.studentId, []);
        eventsByStudent.get(event.studentId).push(event);
    }
    const rows = request.expectedStudentIds.map(studentId => {
        const record = recordsByStudent.get(studentId) ?? null;
        const history = eventsByStudent.get(studentId) ?? [];
        const { reason, exemption } = reviewState(history);
        let status;
        if (!record) status = reason ? 'reason_confirmed' : request.checklistOpen ? 'unconfirmed' : 'pending';
        else if (record.status === 'present') status = 'present';
        else status = exemption?.attendanceReferenceUtc === record.firstRecognizedAtUtc ? 'excused' : 'review_required';
        return Object.freeze({
            studentId, attendanceDate: request.attendanceDate, status,
            hasAttendance: record !== null, firstRecognizedAt: record?.firstRecognizedAt ?? null,
            firstRecognizedAtUtc: record?.firstRecognizedAtUtc ?? null,
            reasonConfirmed: reason !== null, reasonCode: reason?.reasonCode ?? null,
            reasonConfirmedBy: reason?.reviewerId ?? null, reasonConfirmedAt: reason?.reviewedAt ?? null,
            exemptionConfirmedBy: status === 'excused' ? exemption.reviewerId : null,
            reviewId: history.at(-1)?.reviewId ?? 0,
        });
    });
    const filtered = status => Object.freeze(rows.filter(row => row.status === status));
    return Object.freeze({
        attendanceDate: request.attendanceDate, asOf: request.asOf, checklistOpen: request.checklistOpen,
        rows: Object.freeze(rows), unconfirmed: filtered('unconfirmed'),
        awaitingCheckInWithReason: filtered('reason_confirmed'), needsReview: filtered('review_required'),
        counts: Object.freeze({ expected: rows.length, recorded: rows.filter(row => row.hasAttendance).length,
            present: filtered('present').length, excused: filtered('excused').length,
            reviewRequired: filtered('review_required').length, unconfirmed: filtered('unconfirmed').length,
            reasonConfirmedAwaitingCheckIn: filtered('reason_confirmed').length, pending: filtered('pending').length }),
    });
}
