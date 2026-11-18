// AI-authored synthetic demo: no names, biometrics, real reasons or messages.
import { openAttendanceStore } from '../src/daily-attendance.mjs';

const store = openAttendanceStore(':memory:');
const day = '2026-11-18';
const expectedStudentIds = ['S001', 'S002', 'S003', 'S004'];
const at = time => `${day}T${time}+09:00`;
const snapshot = time => store.getRosterSummary({ attendanceDate: day, expectedStudentIds, asOf: at(time) });
try {
    store.recordCheckIn({ studentId: 'S001', recognizedAt: at('18:20:00') });
    store.recordReview({ attendanceDate: day, studentId: 'S002', reviewerId: 'OP001',
        reviewedAt: at('18:15:00'), action: 'confirm_reason', reasonCode: 'reported_reason', expectedReviewId: 0 });
    const atStart = snapshot('18:25:00');
    store.recordCheckIn({ studentId: 'S003', recognizedAt: at('18:26:00') });
    const beforeReview = snapshot('18:26:00');
    const confirmation = store.recordReview({ attendanceDate: day, studentId: 'S003', reviewerId: 'OP001',
        reviewedAt: at('18:27:00'), action: 'confirm_reason', reasonCode: 'outing_return', expectedReviewId: 0 });
    store.recordReview({ attendanceDate: day, studentId: 'S003', reviewerId: 'OP001', reviewedAt: at('18:28:00'),
        action: 'waive_lateness', expectedReviewId: confirmation.reviewId });
    console.log(JSON.stringify({ syntheticOnly: true, atStart, beforeReview,
        afterReview: snapshot('18:30:00'), reviewHistory: store.listReviewHistory({ attendanceDate: day, studentId: 'S003' }) }, null, 2));
} finally { store.close(); }
