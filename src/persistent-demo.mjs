// AI-authored local synthetic sessions. New sessions retain prior databases.
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startDemoServer } from './demo-server.mjs';

export async function startSavedDemo({ directory, fresh = false, ...options }) {
    if (typeof directory !== 'string' || !directory.trim()) throw new Error('가상 기록 저장 폴더가 필요합니다.');
    const folder = resolve(directory);
    await mkdir(folder, { recursive: true });
    const pointer = join(folder, 'active.json');
    let previous;
    let saved;
    try {
        previous = await readFile(pointer);
        saved = JSON.parse(previous.toString('utf8'));
        if (saved.version !== 1 || !/^session-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.sqlite$/.test(saved.databaseFile)) {
            throw new Error('가상 기록 연결 파일을 확인해주세요. 기존 파일은 보존했습니다.');
        }
        await access(join(folder, saved.databaseFile));
    } catch (error) {
        if (error.code !== 'ENOENT' || previous) throw error;
    }
    const creating = fresh || !saved;
    const databaseFile = creating ? `session-${randomUUID()}.sqlite` : saved.databaseFile;
    const databasePath = join(folder, databaseFile);
    const app = await startDemoServer({ ...options, databasePath });
    try {
        if (creating) {
            const suffix = randomUUID();
            if (previous) await writeFile(join(folder, `previous-${suffix}.json`), previous, { flag: 'wx' });
            const temporary = join(folder, `active-${suffix}.tmp`);
            await writeFile(temporary, JSON.stringify({ version: 1, databaseFile }) + '\n', { flag: 'wx' });
            await rename(temporary, pointer);
        }
    } catch (error) { await app.close(); throw error; }
    return { ...app, databasePath };
}
