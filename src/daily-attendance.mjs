// AI-authored local prototype, 2026-11-18 KST. Synthetic use only.
import { DatabaseSync } from 'node:sqlite';
import { parseTimestamp } from './timestamp.mjs';
import { koreanContext, validateDate, validateStudentId } from './attendance-rules.mjs';
import { validateReview, reviewFromRow, reviewState, validateRosterRequest, projectRoster } from './roster.mjs';

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
            CREATE TABLE IF NOT EXISTS reason_reviews (
                review_id INTEGER PRIMARY KEY AUTOINCREMENT,
                previous_review_id INTEGER NOT NULL,
                attendance_date TEXT NOT NULL,
                student_id TEXT NOT NULL,
                reviewer_id TEXT NOT NULL,
                reviewed_at TEXT NOT NULL,
                reviewed_at_utc TEXT NOT NULL,
                reviewed_at_ms INTEGER NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('confirm_reason', 'waive_lateness', 'clear_reason')),
                reason_code TEXT,
                attendance_reference_utc TEXT,
                CHECK ((action = 'confirm_reason' AND reason_code IS NOT NULL AND reason_code IN ('reported_reason', 'outing', 'outing_return'))
                    OR (action IN ('waive_lateness', 'clear_reason') AND reason_code IS NULL))
            ) STRICT;
            CREATE INDEX IF NOT EXISTS reason_reviews_student ON reason_reviews(attendance_date, student_id, review_id);
        `);
        const insert = db.prepare(`
            INSERT INTO daily_attendance
                (student_id, attendance_date, first_recognized_at, first_recognized_at_utc, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (attendance_date, student_id) DO NOTHING
        `);
        const selectOne = db.prepare('SELECT * FROM daily_attendance WHERE attendance_date = ? AND student_id = ?');
        const selectDay = db.prepare('SELECT * FROM daily_attendance WHERE attendance_date = ? ORDER BY student_id');
        const selectReviews = db.prepare('SELECT * FROM reason_reviews WHERE attendance_date = ? AND student_id = ? ORDER BY review_id');
        const selectReviewDay = db.prepare('SELECT * FROM reason_reviews WHERE attendance_date = ? ORDER BY review_id');
        const insertReview = db.prepare(`INSERT INTO reason_reviews
            (previous_review_id, attendance_date, student_id, reviewer_id, reviewed_at, reviewed_at_utc,
                reviewed_at_ms, action, reason_code, attendance_reference_utc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const selectReview = db.prepare('SELECT * FROM reason_reviews WHERE review_id = ?');
        const ensureOpen = () => {
            if (closed) throw new Error('출석 저장소가 닫혔습니다.');
        };
        const transaction = (write, operation) => {
            db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
            try {
                const result = operation();
                db.exec('COMMIT');
                return result;
            } catch (error) {
                if (db.isTransaction) db.exec('ROLLBACK');
                throw error;
            }
        };

        return Object.freeze({
            recordCheckIn({ studentId, recognizedAt } = {}) {
                ensureOpen();
                validateStudentId(studentId);
                const milliseconds = parseTimestamp(recognizedAt, '인식 시각');
                const { attendanceDate, status } = koreanContext(milliseconds);
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
            recordReview(input) {
                ensureOpen();
                const review = validateReview(input);
                return transaction(true, () => {
                    const history = selectReviews.all(review.attendanceDate, review.studentId).map(reviewFromRow);
                    const previous = history.at(-1);
                    if ((previous?.reviewId ?? 0) !== review.expectedReviewId) {
                        const error = new Error('사유 확인 이력이 바뀌었습니다. 최신 명단을 다시 확인해주세요.');
                        error.code = 'STALE_REVIEW';
                        throw error;
                    }
                    if (previous && review.milliseconds < Date.parse(previous.reviewedAtUtc)) {
                        throw new Error('이전 확인보다 과거 시각으로 기록할 수 없습니다.');
                    }
                    let reference = null;
                    if (review.action === 'waive_lateness') {
                        const attendance = recordFromRow(selectOne.get(review.attendanceDate, review.studentId));
                        if (!attendance || attendance.status !== 'review_required') throw new Error('늦은 출석 기록을 먼저 확인해주세요.');
                        if (review.milliseconds < Date.parse(attendance.firstRecognizedAtUtc)) throw new Error('출석보다 이전 시각에 면제할 수 없습니다.');
                        if (!reviewState(history).reason) throw new Error('사유 확인을 먼저 기록해주세요.');
                        reference = attendance.firstRecognizedAtUtc;
                    }
                    const result = insertReview.run(review.expectedReviewId, review.attendanceDate, review.studentId,
                        review.reviewerId, review.reviewedAt, new Date(review.milliseconds).toISOString(),
                        review.milliseconds, review.action, review.reasonCode, reference);
                    return reviewFromRow(selectReview.get(result.lastInsertRowid));
                });
            },
            listReviewHistory({ studentId, attendanceDate } = {}) {
                ensureOpen();
                validateStudentId(studentId);
                validateDate(attendanceDate);
                return Object.freeze(selectReviews.all(attendanceDate, studentId).map(reviewFromRow));
            },
            getRosterSummary(input) {
                ensureOpen();
                const request = validateRosterRequest(input);
                return transaction(false, () => projectRoster(request,
                    selectDay.all(request.attendanceDate).map(recordFromRow),
                    selectReviewDay.all(request.attendanceDate).map(reviewFromRow)));
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
