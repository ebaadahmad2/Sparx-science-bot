(function () {
  'use strict';

  let autoMode = false;
  let autoSubmit = false;
  let lastQuestion = '';
  let observer = null;

  // ── Boot ────────────────────────────────────────────────────────────────
  chrome.storage.local.get(['autoMode', 'autoSubmit', 'botEnabled'], (d) => {
    autoMode   = d.autoMode   || false;
    autoSubmit = d.autoSubmit || false;
    injectFloat();
    if (d.botEnabled && autoMode) startObserver();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_BOT') { autoMode = msg.auto; updateAutoBtn(); msg.auto ? startObserver() : stopObserver(); }
    if (msg.type === 'SOLVE_NOW')  solveQuestion();
  });

  // ── MutationObserver ────────────────────────────────────────────────────
  function startObserver() {
    stopObserver();
    observer = new MutationObserver(debounce(() => { if (autoMode) solveQuestion(); }, 1400));
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  // ── Question Detection ──────────────────────────────────────────────────
  function getQuestion() {
    const tries = [
      '[class*="QuestionText"]','[class*="question-text"]','[class*="questionText"]',
      '[class*="TaskQuestion"]','[class*="task-question"]','[data-testid*="question"]',
      '[class*="Question__text"]','[class*="prompt"]','[class*="stem"]',
    ];
    for (const s of tries) {
      const el = document.querySelector(s);
      if (el && el.innerText.trim().length > 8) return el;
    }
    // Fallback: find an input and walk up
    const input = document.querySelector('input[type="text"],input[type="number"]');
    if (input) {
      let p = input.parentElement;
      for (let i = 0; i < 7 && p; i++) {
        if (p.innerText?.trim().length > 15) return p;
        p = p.parentElement;
      }
    }
    return null;
  }

  function getOptions() {
    const sels = [
      '[class*="AnswerOption"]','[class*="answer-option"]','[class*="Choice"]',
      '[role="radio"]','[role="option"]','label[for*="answer"]',
      '[class*="MultipleChoice"] label','[class*="mcq"] label',
    ];
    for (const s of sels) {
      const els = [...document.querySelectorAll(s)];
      if (els.length >= 2) return els.map(e => e.innerText?.trim()).filter(Boolean);
    }
    return [];
  }

  function getOptionEls() {
    const sels = [
      '[class*="AnswerOption"]','[class*="answer-option"]','[class*="Choice"]',
      '[role="radio"]','[role="option"]','label[for*="answer"]',
      '[class*="MultipleChoice"] label',
    ];
    for (const s of sels) {
      const els = [...document.querySelectorAll(s)];
      if (els.length >= 2) return els;
    }
    return [];
  }

  function getInput() {
    const sels = [
      'input[class*="answer"]','input[class*="Answer"]',
      'input[placeholder*="answer" i]','input[type="text"]',
      'input[type="number"]','textarea[class*="answer"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function getSubmit() {
    for (const btn of document.querySelectorAll('button')) {
      const t = btn.innerText?.toLowerCase() || '';
      if (['submit','check','next','continue'].some(k => t.includes(k)) && isVisible(btn)) return btn;
    }
    return null;
  }

  // ── Fill Answer ────────────────────────────────────────────────────────
  function fillAnswer(answer, options) {
    if (options.length > 0) {
      const optEls = getOptionEls();
      const idx = answer.trim().toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < optEls.length) {
        optEls[idx].click();
        glow(optEls[idx]);
        return true;
      }
      // Try text match
      const al = answer.toLowerCase();
      for (const el of optEls) {
        if (el.innerText.toLowerCase().includes(al)) { el.click(); glow(el); return true; }
      }
      return false;
    }
    const inp = getInput();
    if (inp) {
      inp.focus();
      const setter = Object.getOwnPropertyDescriptor(
        inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'
      )?.set;
      if (setter) { setter.call(inp, answer); }
      else { inp.value = answer; }
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      glow(inp);
      return true;
    }
    return false;
  }

  // ── Main Solve ─────────────────────────────────────────────────────────
  async function solveQuestion() {
    const qEl = getQuestion();
    if (!qEl) { toast('❌ No question found on page', 'error'); return; }
    const qText = qEl.innerText?.trim();
    if (!qText || qText === lastQuestion) return;
    lastQuestion = qText;

    const options = getOptions();
    toast('🤖 Solving…', 'info');
    setStatus('⏳ Thinking…');

    const { apiKey, model, autoSubmit: as } = await getSettings();
    if (!apiKey) { toast('⚠️ No API key! Open the extension popup.', 'warn'); setStatus('❌ No API key'); return; }

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'ASK_AI',
        payload: { apiKey, model, question: qText, options }
      });
      if (resp.error) throw new Error(resp.error);

      const ans = resp.answer;
      showAnswerBubble(ans);
      const filled = fillAnswer(ans, options);
      toast(filled ? `✅ Answered: ${ans}` : `⚠️ Answer: ${ans} — fill manually`, filled ? 'success' : 'warn');
      setStatus(filled ? `✅ ${ans}` : `⚠️ ${ans}`);

      if (filled && (as || autoSubmit)) {
        setTimeout(() => { const btn = getSubmit(); if (btn) { btn.click(); log('Auto-submitted'); } }, 900 + Math.random()*300);
      }
    } catch (e) {
      toast(`❌ ${e.message}`, 'error');
      setStatus('❌ Error');
    }
  }

  // ── Floating Widget ────────────────────────────────────────────────────
  function injectFloat() {
    if (document.getElementById('spx-float')) return;
    const el = document.createElement('div');
    el.id = 'spx-float';
    el.innerHTML = `
      <div class="spx-head">
        <span>🧪 Sparx Bot</span>
        <button id="spx-min">—</button>
      </div>
      <div class="spx-body">
        <div id="spx-status">Idle</div>
        <button id="spx-solve">⚡ Solve</button>
        <button id="spx-auto">🔄 Auto: OFF</button>
      </div>`;
    document.body.appendChild(el);
    makeDraggable(el, el.querySelector('.spx-head'));
    document.getElementById('spx-solve').onclick = solveQuestion;
    document.getElementById('spx-auto').onclick = async () => {
      autoMode = !autoMode;
      await chrome.storage.local.set({ autoMode });
      updateAutoBtn();
      autoMode ? startObserver() : stopObserver();
    };
    document.getElementById('spx-min').onclick = () => {
      const b = el.querySelector('.spx-body');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    };
    updateAutoBtn();
  }

  function updateAutoBtn() {
    const b = document.getElementById('spx-auto');
    if (!b) return;
    b.textContent = `🔄 Auto: ${autoMode ? 'ON' : 'OFF'}`;
    b.style.background = autoMode ? '#16a34a' : '';
  }

  function setStatus(t) { const el = document.getElementById('spx-status'); if (el) el.textContent = t; }

  function showAnswerBubble(ans) {
    document.getElementById('spx-bubble')?.remove();
    const b = document.createElement('div');
    b.id = 'spx-bubble';
    b.innerHTML = `<div class="spx-binner"><span class="spx-blabel">AI Answer</span><span class="spx-bans">${escH(ans)}</span><button onclick="this.closest('#spx-bubble').remove()">✕</button></div>`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 5000);
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `spx-toast spx-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function isVisible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled; }
  function glow(el) { if (!el) return; el.style.outline='2px solid #22c55e'; el.style.outlineOffset='2px'; setTimeout(()=>{el.style.outline='';el.style.outlineOffset='';},2000); }
  function escH(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
  function log(...a) { console.log('%c[SparxBot]','color:#6366f1;font-weight:bold',...a); }
  function getSettings() { return new Promise(r => chrome.storage.local.get(['apiKey','model','autoSubmit'], r)); }

  function makeDraggable(el, handle) {
    let ox=0,oy=0,mx=0,my=0;
    handle.style.cursor='move';
    handle.onmousedown = e => {
      e.preventDefault(); mx=e.clientX; my=e.clientY;
      document.onmousemove = e => { ox=mx-e.clientX; oy=my-e.clientY; mx=e.clientX; my=e.clientY; el.style.top=(el.offsetTop-oy)+'px'; el.style.left=(el.offsetLeft-ox)+'px'; el.style.right='auto'; el.style.bottom='auto'; };
      document.onmouseup = () => { document.onmousemove=null; document.onmouseup=null; };
    };
  }
})();
