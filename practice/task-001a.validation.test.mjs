// AI-authored regression tests, 2026-11-18. No student test authorship claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTime } from './task-001a.mjs';

const start = '2026-11-17T18:25:00+09:00';

for (const [name, recognizedAt, startAt, expected] of [
    ['UTC 표기로 같은 순간', '2026-11-17T09:25:00Z', start, false],
    ['다른 오프셋으로 같은 순간', '2026-11-17T12:25:00+03:00', start, false],
    ['표기 날짜가 달라도 실제로 1분 후', '2026-11-16T23:26:00-10:00', start, true],
    ['정각 직전 밀리초', '2026-11-17T18:24:59.999+09:00', start, false],
    ['정각 직후 밀리초', '2026-11-17T18:25:00.001+09:00', start, true],
    ['소수초 한 자리', '2026-11-17T18:25:00.0+09:00', start, false],
    ['소수초 두 자리', '2026-11-17T18:25:00.01+09:00', start, true],
    ['윤년 2월 29일', '2024-02-29T00:00:01Z', '2024-02-29T00:00:00Z', true],
    ['400년 윤년', '2000-02-29T00:00:00Z', '2000-02-29T00:00:00Z', false],
    ['연도 0000', '0000-02-29T00:00:00Z', '0000-02-29T00:00:00Z', false],
    ['이른 새벽도 허용', '2026-11-17T00:00:00+09:00', start, false],
    ['늦은 밤도 허용', '2026-11-17T23:59:59+09:00', start, true],
]) {
    test(name, () => assert.equal(classifyTime(recognizedAt, startAt), expected));
}

const invalidInputs = [
    ['숫자', 0],
    ['불리언', true],
    ['배열', []],
    ['객체', {}],
    ['Date 객체', new Date(start)],
    ['null', null],
    ['undefined', undefined],
    ['빈 문자열', ''],
    ['공백', ' '],
    ['날짜만 있음', '2026-11-17'],
    ['시간대 누락', '2026-11-17T18:25:00'],
    ['초 누락', '2026-11-17T18:25+09:00'],
    ['다른 날짜 형식', '11/17/2026 18:25'],
    ['달력에 없는 2월 29일', '2026-02-29T18:25:00+09:00'],
    ['윤년이 아닌 1900년', '1900-02-29T00:00:00Z'],
    ['4월 31일', '2026-04-31T18:25:00Z'],
    ['0일', '2026-11-00T18:25:00Z'],
    ['13월', '2026-13-17T18:25:00Z'],
    ['24시', '2026-11-17T24:00:00Z'],
    ['60분', '2026-11-17T18:60:00Z'],
    ['60초', '2026-11-17T18:25:60Z'],
    ['오프셋 24시', '2026-11-17T18:25:00+24:00'],
    ['오프셋 60분', '2026-11-17T18:25:00+09:60'],
    ['앞 공백', ' 2026-11-17T18:25:00Z'],
    ['끝 개행', '2026-11-17T18:25:00Z\n'],
    ['소수초 네 자리', '2026-11-17T18:25:00.0001Z'],
];

for (const [name, value] of invalidInputs) {
    test(`인식 시각 거부: ${name}`, () => {
        assert.throws(() => classifyTime(value, start), /인식 시각/);
    });
    test(`시작 시각 거부: ${name}`, () => {
        assert.throws(() => classifyTime(start, value), /시작 시각/);
    });
}
