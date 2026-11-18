/**
 * AI-authored input validation, 2026-11-18 KST, continuing the user's
 * request for AI implementation. Earlier comparison was AI-guided student entry.
 * This compares instants only; true requires review, not a final late judgment.
 * Daily storage, school exceptions and sensor integration are separate tasks.
 */

import { parseTimestamp } from '../src/timestamp.mjs';

export function classifyTime(recognizedAt, startAt) {
    if (recognizedAt == null || startAt == null) {
        throw new Error('인식 시각과 시작 시각을 모두 입력해주세요.');
    }
    const recognizedTime = parseTimestamp(recognizedAt, '인식 시각');
    const startTime = parseTimestamp(startAt, '시작 시각');
    return recognizedTime > startTime;
}
