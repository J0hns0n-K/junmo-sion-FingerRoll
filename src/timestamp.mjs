// AI-authored shared timestamp validation, extracted without changing the input contract.
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

export function parseTimestamp(value, label = '시각') {
    const invalid = () => new Error(`${label}이 올바르지 않습니다.`);
    if (typeof value !== 'string') throw invalid();
    const match = TIMESTAMP.exec(value);
    if (!match || match[0] !== value) throw invalid();

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
        || hour > 23 || minute > 59 || second > 59) throw invalid();
    if (match[8] !== 'Z' && (Number(match[10]) > 23 || Number(match[11]) > 59)) throw invalid();

    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) throw invalid();
    return milliseconds;
}
