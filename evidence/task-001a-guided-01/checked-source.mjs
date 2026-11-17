/**
 * AI-authored exercise template, 2026-11-17 KST.
 * The student has not implemented this function yet.
 * This is a small time-comparison exercise, not the attendance system.
 *
 * recognizedAt: timestamp string including date and timezone.
 * startAt: timestamp string including date and timezone.
 *
 * Student chooses and documents the return values.
 * Compare actual instants; equal to start is on time.
 * After start means exception review, not final lateness.
 * Invalid/missing inputs must not become attendance or absence.
 * Daily deduplication and reason review are later tasks.
 */
export function classifyTime(recognizedAt, startAt) {
    const recognizedTime = new Date(recognizedAt);
    const startTime = new Date(startAt);
    const needsReview = recognizedTime > startTime;
    return needsReview;
}
