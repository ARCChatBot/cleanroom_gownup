// Training record: who is training, how they did, and a prefilled Airtable form
// to submit the result. No Airtable token is used, so nothing secret is in this
// public site; the student just presses Submit on the Airtable form.
//
// INSTRUCTOR SETUP: paste your Airtable form's share link here
// (Airtable -> your table -> Form view -> Share form -> copy link).
// Field names below must match the column names in your Airtable table exactly.
export const AIRTABLE_FORM_URL = 'https://airtable.com/appvyJpWrOXaMTnMF/pagzWu0YrOxoiTzpT/form';

const TRACK = 'Cleanroom Gowning & ESD (VR)';
// Record value -> Airtable column it is sent to (your "New Trainees" form).
// Add more lines here if you add columns to the form later, e.g.
//   score: 'vr_score',  code: 'vr_verification_code'
const FIELDS = {
    id: 'student_id',
    name: 'student_name',
    duration: 'l1_time_secs'
};
// Shown on the form so students can check them; everything else is hidden
const VISIBLE = new Set(['name', 'id']);
// Labels for "Copy record" (includes values the form has no column for)
const LABELS = {
    name: 'Full Name', id: 'Student ID', score: 'Score', violations: 'Violations', drops: 'Drops',
    duration: 'Time (s)', track: 'Track', completedAt: 'Completed At', code: 'Verification Code'
};
const PENDING_KEY = 'vsu-cleanroom-pending-record';
const TRAINEE_KEY = 'vsu-cleanroom-trainee';

const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } }
};

// Short, readable code derived from the record (SHA-256, Crockford base32)
async function makeCode(r) {
    const text = [r.name, r.id, r.completedAt, r.score, r.violations, r.drops, r.duration, 'VSU-CR-v1'].join('|');
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let bytes;
    try {
        bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    } catch {
        // Fallback (non-secure context): FNV-1a
        let h = 0x811c9dc5;
        bytes = new Uint8Array(8);
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; bytes[i % 8] ^= h & 255; }
    }
    let out = '';
    for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % 32];
    return `VSU-${out.slice(0, 4)}-${out.slice(4)}`;
}

const pad = (n) => String(n).padStart(2, '0');
function localStamp(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formLink(r, base = AIRTABLE_FORM_URL) {
    if (!base) return '';
    const url = new URL(base);
    for (const [key, field] of Object.entries(FIELDS)) {
        url.searchParams.set(`prefill_${field}`, String(r[key] ?? ''));
        if (!VISIBLE.has(key)) url.searchParams.set(`hide_${field}`, 'true');
    }
    return url.toString();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function setupRecord({ onBegin, onNewTrainee }) {
    let trainee = null;
    let startedAt = 0;
    let violations = 0;
    let drops = 0;
    let result = null;

    // ---------------- Start screen ----------------
    const start = document.getElementById('start-screen');
    const nameIn = document.getElementById('trainee-name');
    const idIn = document.getElementById('trainee-id');
    const beginBtn = document.getElementById('begin-btn');
    const saved = store.get(TRAINEE_KEY);
    if (saved) { nameIn.value = saved.name || ''; idIn.value = saved.id || ''; }

    const validate = () => { beginBtn.disabled = !(nameIn.value.trim().length >= 2 && idIn.value.trim().length >= 2); };
    nameIn.addEventListener('input', validate);
    idIn.addEventListener('input', validate);
    validate();

    document.getElementById('start-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (beginBtn.disabled) return;
        trainee = { name: nameIn.value.trim(), id: idIn.value.trim() };
        store.set(TRAINEE_KEY, trainee);
        start.hidden = true;
        document.body.classList.remove('gated');
        resetRun();
        onBegin?.(trainee);
    });

    // ---------------- Submit screen ----------------
    const submit = document.getElementById('submit-screen');
    const summary = document.getElementById('record-summary');
    const submitBtn = document.getElementById('submit-btn');
    const submitNote = document.getElementById('submit-note');
    const copyBtn = document.getElementById('copy-btn');

    function showSubmit(r) {
        summary.innerHTML = `
            <dt>Name</dt><dd>${esc(r.name)}</dd>
            <dt>Student ID</dt><dd>${esc(r.id)}</dd>
            <dt>Score</dt><dd>${r.score} / 100</dd>
            <dt>Violations</dt><dd>${r.violations}</dd>
            <dt>Dropped garments</dt><dd>${r.drops}</dd>
            <dt>Time</dt><dd>${Math.floor(r.duration / 60)} min ${r.duration % 60} s</dd>
            <dt>Completed</dt><dd>${esc(r.completedAt)}</dd>
            <dt>Verification code</dt><dd class="code">${esc(r.code)}</dd>`;
        const link = formLink(r);
        submitBtn.disabled = !link;
        submitNote.textContent = link
            ? 'Opens the Airtable form with your results filled in. Press Submit on that form to save your record.'
            : 'Instructor: the Airtable form link is not set yet (AIRTABLE_FORM_URL in record.js). Use "Copy record" for now.';
        submit.hidden = false;
    }

    submitBtn.addEventListener('click', () => {
        if (!result) return;
        const link = formLink(result);
        if (!link) return;
        window.open(link, '_blank', 'noopener');
        submitNote.textContent = 'Form opened in a new tab. Once Airtable shows its thank-you message, your record is saved.';
        store.del(PENDING_KEY);
    });

    copyBtn.addEventListener('click', async () => {
        if (!result) return;
        const text = Object.entries(LABELS).map(([k, label]) => `${label}: ${result[k]}`).join('\n');
        try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Copy failed'; }
        setTimeout(() => { copyBtn.textContent = 'Copy record'; }, 1500);
    });

    document.getElementById('new-trainee-btn').addEventListener('click', () => {
        store.del(PENDING_KEY);
        result = null;
        submit.hidden = true;
        nameIn.value = '';
        idIn.value = '';
        validate();
        store.del(TRAINEE_KEY);
        start.hidden = false;
        document.body.classList.add('gated');
        onNewTrainee?.();
    });

    // A record that was finished but never submitted (page reloaded, etc.)
    const pending = store.get(PENDING_KEY);
    if (pending) {
        result = pending;
        start.hidden = true;
        document.body.classList.remove('gated');
        showSubmit(pending);
    }

    function resetRun() {
        startedAt = performance.now();
        violations = 0;
        drops = 0;
        result = null;
    }

    return {
        get trainee() { return trainee; },
        get result() { return result; },
        get violations() { return violations; },
        get drops() { return drops; },
        violation() { if (!result) violations++; },
        drop() { if (!result) drops++; },
        resetRun,
        async finish() {
            if (result) return result;
            const now = new Date();
            const r = {
                name: trainee?.name || 'Unknown',
                id: trainee?.id || 'Unknown',
                score: Math.max(0, 100 - violations * 10 - drops * 5),
                violations,
                drops,
                duration: Math.round((performance.now() - startedAt) / 1000),
                track: TRACK,
                completedAt: localStamp(now)
            };
            r.code = await makeCode(r);
            result = r;
            store.set(PENDING_KEY, r);
            return r;
        },
        showSubmit: () => result && showSubmit(result)
    };
}
