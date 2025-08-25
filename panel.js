// Elements
const els = {
    // header/settings
    settingsBox: document.getElementById('settingsBox'),
    settingsBtn: document.getElementById('settingsBtn'),
    // settingsPanel: document.getElementById('settingsPanel'),
    optShowProgress: document.getElementById('optShowProgress'),
    optFlashFinish: document.getElementById('optFlashFinish'),
    clockFmtRadios: () => [...document.querySelectorAll('input[name="clockFmt"]')],

    // time input
    timeDisplay: document.getElementById('timeDisplay'),
    digitInput: document.getElementById('digitInput'),

    // remaining + progress
    remaining: document.getElementById('remaining'),
    timerBox: document.getElementById('timer'),
    progressWrap: document.getElementById('progressWrap'),
    progressFill: document.getElementById('progressFill'),
    progressTicks: document.getElementById('progressTicks'),

    // controls
    start: document.getElementById('start'),
    pause: document.getElementById('pause'),
    reset: document.getElementById('reset'),
    acknowledge: document.getElementById('ack'),

    // clocks
    local: document.getElementById('local'),
    utc: document.getElementById('utc'),
    finished: document.getElementById('time-finished'),
};

// State
let digitBuffer = "";          // up to 6 digits typed, right-to-left HHMMSS
let endAt = null;              // ms epoch when timer ends
let pausedRemaining = null;    // ms remaining when paused
let timerId = null;
let inputHasFocus = false;

const STORE_KEY = 'ct_sidepanel_v2';

// Defaults
const defaults = {
    digits: "",
    showProgress: true,
    flashOnFinish: true,
    clockFmt: '24',              // '12' or '24'
};

// ---- Init ----
(async function init() {
    const stored = await chrome.storage.local.get(STORE_KEY);
    const s = stored[STORE_KEY] || defaults;

    digitBuffer = sanitizeDigits(s.digits || "").slice(-6);

    // Settings UI
    els.optShowProgress.checked = s.showProgress ?? defaults.showProgress;
    els.optFlashFinish.checked = s.flashOnFinish ?? defaults.flashOnFinish;
    const fmt = s.clockFmt === '12' ? '12' : '24';
    els.clockFmtRadios().forEach(r => r.checked = (r.value === fmt));

    // Render base
    renderDigitDisplay();
    renderRemaining(totalMs());
    toggleProgressVisibility();

    // Bind events
    bindEvents();

    // Kick clocks
    updateClocks(); setInterval(updateClocks, 250);

    // Focus hidden input to accept typing immediately
    focusDigitInput();
})();

// ---- Events ----
function bindEvents() {
    // Settings panel toggle
    els.settingsBtn.addEventListener('click', () => {
        const collapsed = els.settingsBox.classList.toggle('collapsed');
        els.settingsBox.setAttribute('aria-hidden', String(collapsed));
        els.settingsBtn.setAttribute('aria-expanded', String(!collapsed));
    });

    // Settings changes
    els.optShowProgress.addEventListener('change', () => { persist(); toggleProgressVisibility(); renderTicks(); });
    els.optFlashFinish.addEventListener('change', persist);
    els.clockFmtRadios().forEach(r => r.addEventListener('change', () => { persist(); updateClocks(); }));

    // Input model
    els.timeDisplay.addEventListener('click', focusDigitInput);

    els.digitInput.addEventListener('focus', () => { inputHasFocus = true; renderDigitDisplay(); });
    els.digitInput.addEventListener('blur',  () => { inputHasFocus = false; renderDigitDisplay(); });

    els.digitInput.addEventListener('beforeinput', onBeforeInput, { passive: false });
    els.digitInput.addEventListener('keydown', onKeyDown);

    // Controls
    els.start.addEventListener('click', start);
    els.pause.addEventListener('click', pause);
    els.reset.addEventListener('click', reset);
    els.acknowledge.addEventListener('click', stopFlashing);
}

// ---- Clocks ----
function updateClocks() {
    const fmt = getClockFmt();
    const now = new Date();
    els.local.textContent = fmtTime(now, fmt, false);
    els.utc.textContent = fmtTime(now, fmt, true);
}
function getClockFmt() {
    const r = els.clockFmtRadios().find(r => r.checked);
    return r ? r.value : '24';
}
function fmtTime(d, fmt, isUTC) {
    let h = isUTC ? d.getUTCHours() : d.getHours();
    const m = isUTC ? d.getUTCMinutes() : d.getMinutes();
    const s = isUTC ? d.getUTCSeconds() : d.getSeconds();
    const pad2 = n => String(n).padStart(2, '0');

    if (fmt === '12') {
        const am = h < 12;
        let h12 = h % 12; if (h12 === 0) h12 = 12;
        if (isUTC) {
            return `${h12}:${pad2(m)} ${am ? 'am' : 'pm'}`;
        } else {
            return `${h12}:${pad2(m)}:${pad2(s)} ${am ? 'am' : 'pm'}`;
        }
    }
    // 24h
    if (isUTC) {
        return `${pad2(h)}:${pad2(m)}`;
    } else {
        return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    }
}
function updateFinish() {
    const fmt = getClockFmt();
    const now = new Date();
    els.finished.textContent = fmtTime(now, fmt, false);
    // els.utc.textContent = fmtTime(now, fmt, true);
}

// ---- Digit input model (right-to-left HH:MM:SS) ----
function sanitizeDigits(s) { return (s || "").replace(/\D+/g, ""); }
function pushDigit(d) {
    if (!/^\d$/.test(d)) return;
    digitBuffer = (digitBuffer + d).slice(-6);
}
function popDigit() {
    digitBuffer = digitBuffer.slice(0, -1);
}
function bufferToHMS(buf) {
    const p = (buf || "").padStart(6, '0').slice(-6);
    let h = parseInt(p.slice(0, 2), 10);
    let m = parseInt(p.slice(2, 4), 10);
    let s = parseInt(p.slice(4, 6), 10);
    m = Math.min(m, 59);
    s = Math.min(s, 59);
    return { h, m, s };
}
function totalMs() {
    const { h, m, s } = bufferToHMS(digitBuffer);
    return ((h * 60 + m) * 60 + s) * 1000;
}
function renderDigitDisplay() {
    const len = digitBuffer.length;
    const p = digitBuffer.padStart(6, '0').slice(-6).split('');
    const filledMask = [0, 1, 2, 3, 4, 5].map(i => i >= (6 - len));
    const parts = [];
    for (let i = 0; i < 6; i++) {
        parts.push(`<span class="d${filledMask[i] ? ' filled' : ''}">${p[i]}</span>`);
        if (i === 1 || i === 3) parts.push(`<span class="sep">:</span>`);
    }

    // caret goes at the far right edge of the time string
    if (inputHasFocus) parts.push('<span class="caret"></span>');

    els.timeDisplay.innerHTML = parts.join('');
}
function focusDigitInput() {
    els.digitInput.value = "";
    els.digitInput.focus({ preventScroll: true });
}
function onBeforeInput(e) {
    const t = e.inputType;
    if (t === 'insertText') {
        const data = sanitizeDigits(e.data || "");
        if (!data) return e.preventDefault();
        for (const ch of data) pushDigit(ch);
        persist(); renderAll(); e.preventDefault();
    } else if (t === 'deleteContentBackward') {
        popDigit(); persist(); renderAll(); e.preventDefault();
    } else if (t === 'insertFromPaste') {
        const pasted = sanitizeDigits(e.data || '');
        if (!pasted) return e.preventDefault();
        for (const ch of pasted) pushDigit(ch);
        persist(); renderAll(); e.preventDefault();
    }
}
function onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Delete') {
        digitBuffer = ""; persist(); renderAll(); e.preventDefault();
    } else if (e.key === 'Enter') {
        start(); e.preventDefault();
    }
}

// ---- Remaining + Progress ----
function renderRemaining(ms) {
    ms = Math.max(0, Math.floor(ms));
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    els.remaining.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function chooseTickInterval(totalMsVal) {
    const totalMin = totalMsVal / 60000;
    if (totalMin <= 15) return 1;      // minutes
    if (totalMin <= 90) return 5;      // minutes
    return 60;                         // minutes
}

function renderTicks() {
    const show = getState().showProgress;
    const tot = totalMs();
    els.progressTicks.innerHTML = '';
    if (!show || tot <= 0) return;

    const tickMinutes = chooseTickInterval(tot);
    const totalMinutes = tot / 60000;
    const tickCount = Math.floor(totalMinutes / tickMinutes);

    for (let i = 1; i <= tickCount; i++) {
        const tMs = i * tickMinutes * 60000;
        const pct = (tMs / tot) * 100;
        const tick = document.createElement('div');
        tick.className = 'progress-tick';
        tick.style.left = `${pct}%`;
        els.progressTicks.appendChild(tick);
    }
}

function updateProgress(remainingMs) {
    const show = getState().showProgress;
    const tot = totalMs();
    if (!show) {
        els.progressWrap.style.display = 'none';
        return;
    }
    els.progressWrap.style.display = '';
    const pct = Math.max(0, Math.min(1, remainingMs / tot));
    els.progressFill.style.width = `${pct * 100}%`;
}

// ---- Timer ----
function tick() {
    const ms = endAt - Date.now();
    renderRemaining(ms);
    updateProgress(ms);
    if (ms <= 0) finish();
}

function start() {
    const base = pausedRemaining ?? totalMs();
    if (base <= 0) return;
    endAt = Date.now() + base;
    timerId = setInterval(tick, 200);

    stopFlashing();
    els.start.disabled = true;
    els.pause.disabled = false;
    els.reset.disabled = false;

    // (Re)build ticks at start based on total
    renderTicks();
    updateProgress(base);
}

function pause() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = null;
    pausedRemaining = Math.max(0, endAt - Date.now());

    els.start.disabled = false;
    els.pause.disabled = true;
}

function reset() {
    clearInterval(timerId);
    timerId = null;
    endAt = null;
    pausedRemaining = null;
    const tot = totalMs();
    renderRemaining(tot);
    updateProgress(tot);

    stopFlashing();
    els.start.disabled = false;
    els.pause.disabled = true;
    els.reset.disabled = true;
}

function finish() {
    clearInterval(timerId);
    const flash = getState().flashOnFinish;

    timerId = null;
    endAt = null;
    pausedRemaining = null;

    els.start.disabled = false;
    els.pause.disabled = true;
    els.reset.disabled = true;

    if (!flash) {
        els.acknowledge.disabled = true;
    } else {
        els.acknowledge.disabled = false;
    }

    if (flash) {
        els.timerBox.classList.add('flash');
        setTimeout(() => els.acknowledge.disabled = true, 10000);
    }

    updateFinish();
}

function stopFlashing() {
    els.timerBox.classList.remove('flash');
    els.acknowledge.disabled = true;
}

// ---- Settings + Persistence ----
function getState() {
    return {
        digits: digitBuffer,
        showProgress: els.optShowProgress.checked,
        flashOnFinish: els.optFlashFinish.checked,
        clockFmt: (els.clockFmtRadios().find(r => r.checked)?.value) || '24',
    };
}
function persist() {
    chrome.storage.local.set({ [STORE_KEY]: getState() });
}
function toggleProgressVisibility() {
    els.progressWrap.style.display = els.optShowProgress.checked ? '' : 'none';
}

// ---- Rerender helpers ----
function renderAll() {
    renderDigitDisplay();
    const tot = totalMs();
    renderRemaining(tot);
    renderTicks();
    updateProgress(tot);
}

(function setupIconThemeSync() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () =>
    chrome.runtime.sendMessage({
      type: "setIconTheme",
      theme: mq.matches ? "dark" : "light"
    });

  apply();
  mq.addEventListener("change", apply);
})();
