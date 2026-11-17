// AI-authored teaching example, 2026-11-17 KST.
// The student has not yet added their own test case.
// One supplied example is not completion of the student's testing task.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTime } from './task-001a.mjs';

const startAt = '2026-11-17T18:25:00+09:00';

test('정각은 사유 확인 대상이 아니다 - AI 제공 예시', () => {
    const result = classifyTime('2026-11-17T18:25:00+09:00', startAt);
    assert.equal(result, false);
});

// 학생 과제: 위 예시를 참고하되, 직접 고른 다른 시각과 예상 결과로
// 새 테스트를 아래에 작성하세요. 테스트 이름도 검사할 내용을 설명하세요.
