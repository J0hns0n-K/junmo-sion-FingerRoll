// AI-provided code entered by the student under guidance, 2026-11-18 KST.
// Case 1 time/expectation: AI. Case 2 time (18:26) and expectation (true): user.
// Synthetic date and test code: AI. This is not independent implementation or task completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTime } from './task-001a.mjs';

const startAt = '2026-11-17T18:25:00+09:00';

test('18시 20분은 사유 확인 대상이 아니다 - 안내 연습', () => {
    const result = classifyTime('2026-11-17T18:20:00+09:00', startAt);
    assert.equal(result, false);
});

// 사용자 선택: 18:26이면 사유 확인이 필요(true).
// 아래 코드는 AI가 안내했고 학생이 입력했습니다.

test('18시 26분은 사유 확인이 필요하다', () => {
    const result = classifyTime('2026-11-17T18:26:00+09:00', startAt);
    assert.equal(result, true);
});
