/**
 * AI-guided exercise, 2026-11-17 KST.
 * The student entered the date conversion, comparison and return lines
 * supplied by AI. This is guided practice, not independent implementation.
 * This is a small time-comparison exercise, not the attendance system.
 *
 * recognizedAt: timestamp string including date and timezone.
 * startAt: timestamp string including date and timezone.
 *
 * Current result is a boolean: after start requires exception review.
 * Compare actual instants; equal to start is on time.
 * After start means exception review, not final lateness.
 * Invalid/missing input handling is still unimplemented.
 * Daily deduplication and reason review are later tasks.
 */
export function classifyTime(recognizedAt, startAt) {
    const recognizedTime = new Date(recognizedAt);
    const startTime = new Date(startAt);
    const needsReview = recognizedTime > startTime;
    return needsReview;
}
