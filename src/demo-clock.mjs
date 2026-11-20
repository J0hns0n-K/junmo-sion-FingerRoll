// AI-authored synthetic session clock; never a source of real attendance time.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const start = Date.parse('2026-11-18T18:24:00+09:00');
const end = Date.parse('2026-11-18T23:59:59.999+09:00');

export function openDemoClock(databasePath, now) {
    const create = databasePath === ':memory:' || !existsSync(databasePath);
    const db = new DatabaseSync(databasePath);
    try {
        db.exec('PRAGMA busy_timeout = 5000;');
        if (create) {
            db.exec(`CREATE TABLE demo_clock (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                version INTEGER NOT NULL CHECK (version = 1),
                session_id TEXT NOT NULL,
                checkpoint_ms INTEGER NOT NULL
            ) STRICT;`);
            db.prepare('INSERT INTO demo_clock VALUES (1, 1, ?, ?)').run(randomUUID(), start);
        }
        const saved = db.prepare('SELECT * FROM demo_clock WHERE singleton = 1').get();
        if (!saved || saved.version !== 1 || !/^[0-9a-f-]{36}$/.test(saved.session_id) ||
            !Number.isSafeInteger(saved.checkpoint_ms) || saved.checkpoint_ms < start || saved.checkpoint_ms > end) {
            throw new Error('가상 시계 저장 파일을 확인해주세요. 기존 파일은 초기화하지 않았습니다.');
        }
        let base = saved.checkpoint_ms;
        let anchor = now();
        let last = base;
        const update = db.prepare('UPDATE demo_clock SET checkpoint_ms = max(checkpoint_ms, ?) WHERE singleton = 1 RETURNING checkpoint_ms');
        const read = () => {
            last = Math.max(last, Math.min(end, Math.trunc(base + Math.max(0, now() - anchor))));
            return last;
        };
        const checkpoint = () => {
            const value = read();
            // Commit the event time before an attendance/review write, including abrupt exits.
            last = update.get(value).checkpoint_ms;
            return last;
        };
        return { sessionId: saved.session_id, read, checkpoint,
            advance(seconds) {
                const value = Math.min(end, read() + seconds * 1000);
                base = last = update.get(value).checkpoint_ms;
                anchor = now();
            },
            get running() { return read() < end; },
            close() { try { checkpoint(); } finally { db.close(); } },
        };
    } catch (error) { db.close(); throw error; }
}
