// AI-authored synthetic demo; no real student data or biometric collection.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openAttendanceStore } from '../src/daily-attendance.mjs';

const directory = new URL('../local/synthetic-attendance/', import.meta.url);
mkdirSync(directory, { recursive: true });
const store = openAttendanceStore(fileURLToPath(new URL('demo.sqlite', directory)));
try {
    for (const input of [
        { studentId: 'S001', recognizedAt: '2026-11-18T18:20:00+09:00' },
        { studentId: 'S001', recognizedAt: '2026-11-18T20:00:00+09:00' },
        { studentId: 'S001', recognizedAt: '2026-11-19T18:26:00+09:00' },
    ]) console.log(JSON.stringify({ input, ...store.recordCheckIn(input) }));
    console.log(JSON.stringify({ syntheticOnly: true, recordsForNov18: store.listForDate('2026-11-18') }));
} finally { store.close(); }
