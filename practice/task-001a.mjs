/**
 * AI-guided exercise, 2026-11-17 KST.
 * The student entered AI-provided conversion, comparison, return and
 * invalid-date/missing-value checks with AI review. This is guided practice, not independent implementation.
 * This is a small time-comparison exercise, not the attendance system.
 *
 * recognizedAt: timestamp string including date and timezone.
 * startAt: timestamp string including date and timezone.
 *
 * Current result is a boolean: after start requires exception review.
 * Compare actual instants; equal to start is on time.
 * After start means exception review, not final lateness.
 * Invalid Date and null/undefined checks are present; type/format validation remains incomplete.
 * Daily deduplication and reason review are later tasks.
 */
export function classifyTime(recognizedAt, startAt) {
    if (recognizedAt == null || startAt == null) {
    throw new Error('인식 시각과 시작 시각을 모두 입력해주세요.');
}
    const recognizedTime = new Date(recognizedAt);
        if (Number.isNaN(recognizedTime.getTime())) {
        throw new Error('인식 시각이 올바르지 않습니다.');
}
    const startTime = new Date(startAt);
        if (Number.isNaN(startTime.getTime())) {
        throw new Error('시작 시각이 올바르지 않습니다.');
}
    const needsReview = recognizedTime > startTime;
    return needsReview;
}
