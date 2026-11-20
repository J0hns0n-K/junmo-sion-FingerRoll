// AI-authored browser for the synthetic laptop demo only.
const $ = id => document.getElementById(id);
const names = { pending: '확인 전', unconfirmed: '미확인', present: '정상 출석',
    review_required: '지각 여부 확인', reason_confirmed: '사유 확인 · 출석 전', excused: '지각 면제' };
const reasons = { reported_reason: '전달받은 사유', outing: '외출 중', outing_return: '복귀 직후 확인' };
const actions = { confirm_reason: '사유 확인', clear_reason: '사유 확인 취소', waive_lateness: '지각 면제' };
const time = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '—';
let latest, busy = false, selected, auditStudent, toastTimer, sessionId;
function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4500);
}
async function api(path, data) {
    const response = await fetch(path, data === undefined ? { cache: 'no-store' } : {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FingerRoll-Demo': '1', 'X-FingerRoll-Session': sessionId ?? '' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? '요청을 완료하지 못했습니다.');
    return result;
}
function button(text, handler, style = 'secondary') {
    const element = document.createElement('button'); element.textContent = text; element.className = style;
    element.disabled = busy; element.addEventListener('click', handler); return element;
}
function render(data) {
    if (sessionId && sessionId !== data.sessionId) {
        latest = undefined; selected = undefined; auditStudent = undefined;
        $('reason-dialog').close(); $('history').replaceChildren();
        $('audit-label').textContent = '새 연습입니다. 학생의 ‘이력’을 눌러 확인해주세요.';
        toast('새 연습 세션을 불러왔습니다. 이전 화면의 작업은 다시 확인해주세요.');
    }
    sessionId = data.sessionId;
    if (latest && Date.parse(data.summary.asOf) < Date.parse(latest.asOf)) return;
    const focused = document.activeElement?.closest('#roster button');
    const restore = focused && { id: focused.closest('tr').firstChild.textContent, text: focused.textContent };
    latest = data.summary;
    $('clock').textContent = time(latest.asOf);
    $('recorded').replaceChildren(document.createTextNode(`${latest.counts.recorded} `), Object.assign(document.createElement('small'), { textContent: '/ 4' }));
    $('confirmed').textContent = latest.counts.present + latest.counts.excused;
    $('review').textContent = latest.counts.reviewRequired;
    $('unconfirmed').textContent = latest.checklistOpen ? latest.counts.unconfirmed : '—';
    $('checklist').textContent = latest.checklistOpen
        ? `미확인 ${latest.counts.unconfirmed}명 · 사유 확인 후 출석 대기 ${latest.counts.reasonConfirmedAwaitingCheckIn}명. 상황을 직접 확인해주세요.`
        : '18:25부터 미확인 학생을 구분합니다. 출석은 지금도 가능합니다.';
    const rows = latest.rows.map(row => {
        const tr = document.createElement('tr');
        const cells = Array.from({ length: 5 }, () => document.createElement('td'));
        cells[0].textContent = row.studentId;
        const badge = Object.assign(document.createElement('span'), { textContent: names[row.status], className: `status ${row.status}` });
        cells[1].append(badge); cells[2].textContent = time(row.firstRecognizedAt);
        cells[3].textContent = row.reasonConfirmed ? reasons[row.reasonCode] : '확인 없음';
        const controls = Object.assign(document.createElement('div'), { className: 'row-actions' });
        controls.append(button('가상 출석', () => mutate('/api/scan', { studentId: row.studentId }, result =>
            result.result.created ? `${row.studentId} 출석 기록을 만들었습니다.` : `${row.studentId} 첫 출석 ${time(result.result.record.firstRecognizedAt)}을 유지했습니다.`), ''));
        controls.append(button('사유 확인', () => {
            selected = { studentId: row.studentId, expectedReviewId: row.reviewId };
            $('reason-student').textContent = `${row.studentId} · 가상 학생`;
            $('reason-code').value = row.reasonCode ?? 'reported_reason';
            $('reason-error').textContent = ''; $('reason-dialog').showModal();
        }));
        if (row.status === 'review_required' && row.reasonConfirmed) controls.append(button('지각 면제', () =>
            mutate('/api/review', { studentId: row.studentId, action: 'waive_lateness', expectedReviewId: row.reviewId }, () => '지각 면제를 기록했습니다. 첫 인식 시각은 유지됩니다.')));
        if (row.reasonConfirmed) controls.append(button('사유 취소', () =>
            mutate('/api/review', { studentId: row.studentId, action: 'clear_reason', expectedReviewId: row.reviewId }, () => '사유 확인을 취소하고 변경 이력을 남겼습니다.')));
        controls.append(button('이력', () => showHistory(row.studentId), 'history-button'));
        cells[4].append(controls); tr.append(...cells); return tr;
    });
    $('roster').replaceChildren(...rows);
    if (restore) {
        const row = rows.find(item => item.firstChild.textContent === restore.id);
        const target = [...(row?.querySelectorAll('button') ?? [])].find(item => item.textContent === restore.text);
        target?.focus({ preventScroll: true });
    }
    $('advance').disabled = busy || !data.clockRunning;
    $('storage-note').textContent = data.persistent
        ? '가상 출석·사유·시계는 이 노트북에 자동 저장됩니다. 다시 켜도 이어서 확인할 수 있어요.'
        : '일회성 메모리 데모입니다. 이 실행의 가상 기록은 종료하면 사라집니다.';
    $('connection').textContent = `● 노트북 데모 연결됨 · ${time(latest.asOf)} 갱신${data.clockRunning ? '' : ' · 가상 하루가 끝났습니다. 새 연습을 시작하려면 사용 안내를 확인하세요.'}`;
}
async function refresh() {
    if (busy) return;
    try { const result = await api('/api/state'); if (!busy) render(result); }
    catch { $('connection').textContent = '연결이 끊겼습니다. 화면이 최신 상태가 아니니 출석·미확인을 판단하지 마세요.'; }
}
async function mutate(path, input, message) {
    if (busy) return;
    busy = true; document.querySelectorAll('button').forEach(item => { item.disabled = true; });
    try {
        const result = await api(path, input);
        busy = false; render(result); toast(message(result));
        if (auditStudent) await showHistory(auditStudent);
        return true;
    } catch (error) {
        busy = false; toast(error.message);
        try { render(await api('/api/state')); } catch { $('connection').textContent = '연결이 끊겼습니다. 최신 명단을 확인할 수 없습니다.'; }
        return false;
    } finally { document.querySelectorAll('#reason-dialog button').forEach(item => { item.disabled = false; }); }
}
async function showHistory(studentId) {
    auditStudent = studentId;
    $('audit-label').textContent = `${studentId} · 확인 담당자 DEMO_OPERATOR (가상 표시, 로그인 아님)`;
    try {
        const events = await api(`/api/history?studentId=${encodeURIComponent(studentId)}`);
        $('history').replaceChildren(...events.map(event => Object.assign(document.createElement('li'), {
            textContent: `${time(event.reviewedAt)} · ${actions[event.action]}${event.reasonCode ? ` / ${reasons[event.reasonCode]}` : ''} · 이력 #${event.reviewId}`,
        })));
        if (!events.length) $('history').append(Object.assign(document.createElement('li'), { textContent: '아직 확인 이력이 없습니다.' }));
    } catch (error) { $('history').replaceChildren(); toast(error.message); }
}
$('advance').addEventListener('click', () => mutate('/api/clock', { advanceSeconds: 60 }, () => '가상 시계를 1분 앞으로 옮겼습니다.'));
$('cancel-reason').addEventListener('click', () => $('reason-dialog').close());
$('reason-form').addEventListener('submit', async event => {
    event.preventDefault();
    const ok = await mutate('/api/review', { ...selected, action: 'confirm_reason', reasonCode: $('reason-code').value }, () => '사유 확인을 기록했습니다. 출석 여부는 별도입니다.');
    if (ok) $('reason-dialog').close(); else $('reason-error').textContent = '저장하지 못했습니다. 취소한 뒤 최신 명단에서 다시 확인해주세요.';
});
refresh(); setInterval(refresh, 1000);
