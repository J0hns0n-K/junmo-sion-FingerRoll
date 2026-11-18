// AI-authored local prototype, 2026-11-18 KST. Synthetic use only.
import { DatabaseSync } from 'node:sqlite';
import { parseTimestamp } from './timestamp.mjs';

const koreanClock = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', calendar: 'gregory', numberingSystem: 'latn',
    era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function validateStudentId(studentId) {
    if (typeof studentId !== 'string' || studentId.length > 64
        || !/^[A-Za-z0-9]/.test(studentId) || /[^A-Za-z0-9_-]/.test(studentId)) {
        throw new Error('학생 ID는 영문·숫자로 시작하는 1~64자 가명 ID여야 합니다.');
    }
}

function localContext(milliseconds) {
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
    };
}

function validateDate(attendanceDate) {
    if (typeof attendanceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
        || attendanceDate.startsWith('0000')) throw new Error('출석 날짜가 올바르지 않습니다.');
    parseTimestamp(`${attendanceDate}T00:00:00+09:00`, '출석 날짜');
}

function recordFromRow(row) {
    if (!row) return null;
    return Object.freeze({
        studentId: row.student_id,
        attendanceDate: row.attendance_date,
        firstRecognizedAt: row.first_recognized_at,
        firstRecognizedAtUtc: row.first_recognized_at_utc,
        status: row.status,
    });
}

export function openAttendanceStore(databasePath) {
    if (typeof databasePath !== 'string' || databasePath.trim() === '') {
        throw new Error('저장할 데이터베이스 경로를 지정해주세요.');
    }
    const db = new DatabaseSync(databasePath);
    let closed = false;
    try {
        db.exec(`
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS daily_attendance (
                student_id TEXT NOT NULL,
                attendance_date TEXT NOT NULL,
                first_recognized_at TEXT NOT NULL,
                first_recognized_at_utc TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('present', 'review_required')),
                PRIMARY KEY (attendance_date, student_id)
            ) STRICT;
        `);
        const insert = db.prepare(`
            INSERT INTO daily_attendance
                (student_id, attendance_date, first_recognized_at, first_recognized_at_utc, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (attendance_date, student_id) DO NOTHING
        `);
        const selectOne = db.prepare('SELECT * FROM daily_attendance WHERE attendance_date = ? AND student_id = ?');
        const selectDay = db.prepare('SELECT * FROM daily_attendance WHERE attendance_date = ? ORDER BY student_id');
        const ensureOpen = () => {
            if (closed) throw new Error('출석 저장소가 닫혔습니다.');
        };

        return Object.freeze({
            recordCheckIn({ studentId, recognizedAt } = {}) {
                ensureOpen();
                validateStudentId(studentId);
                const milliseconds = parseTimestamp(recognizedAt, '인식 시각');
                const { attendanceDate, status } = localContext(milliseconds);
                const result = insert.run(studentId, attendanceDate, recognizedAt,
                    new Date(milliseconds).toISOString(), status);
                return Object.freeze({
                    created: Number(result.changes) === 1,
                    record: recordFromRow(selectOne.get(attendanceDate, studentId)),
                });
            },
            getAttendance({ studentId, attendanceDate } = {}) {
                ensureOpen();
                validateStudentId(studentId);
                validateDate(attendanceDate);
                return recordFromRow(selectOne.get(attendanceDate, studentId));
            },
            listForDate(attendanceDate) {
                ensureOpen();
                validateDate(attendanceDate);
                return Object.freeze(selectDay.all(attendanceDate).map(recordFromRow));
            },
            close() {
                if (!closed) {
                    db.close();
                    closed = true;
                }
            },
        });
    } catch (error) {
        db.close();
        throw error;
    }
}
