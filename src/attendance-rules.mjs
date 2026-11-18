// AI-authored shared Korean-day rules, 2026-11-18 KST.
import { parseTimestamp } from './timestamp.mjs';

const koreanClock = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', calendar: 'gregory', numberingSystem: 'latn',
    era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function validateStudentId(studentId, label = '학생 ID') {
    if (typeof studentId !== 'string' || studentId.length > 64
        || !/^[A-Za-z0-9]/.test(studentId) || /[^A-Za-z0-9_-]/.test(studentId)) {
        throw new Error(`${label}는 영문·숫자로 시작하는 1~64자 가명 ID여야 합니다.`);
    }
}

export function koreanContext(milliseconds) {
    const parts = Object.fromEntries(koreanClock.formatToParts(new Date(milliseconds))
        .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const year = Number(parts.year);
    if (parts.era !== 'AD' || year < 1 || year > 9999) {
        throw new Error('출석 저장은 한국 날짜의 연도 0001~9999만 지원합니다.');
    }
    const localSeconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
    const cutoffSeconds = 18 * 3600 + 25 * 60;
    const afterStart = localSeconds > cutoffSeconds
        || (localSeconds === cutoffSeconds && new Date(milliseconds).getUTCMilliseconds() > 0);
    return {
        attendanceDate: `${String(year).padStart(4, '0')}-${parts.month}-${parts.day}`,
        status: afterStart ? 'review_required' : 'present',
        checklistOpen: localSeconds >= cutoffSeconds,
    };
}

export function validateDate(attendanceDate) {
    if (typeof attendanceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
        || attendanceDate.startsWith('0000')) throw new Error('출석 날짜가 올바르지 않습니다.');
    parseTimestamp(`${attendanceDate}T00:00:00+09:00`, '출석 날짜');
}
