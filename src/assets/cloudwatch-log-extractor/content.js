/**
 * MVAX Log → cURL  —  Content script
 *
 * Injects a floating widget into AWS CloudWatch pages.
 * One-click: reads clipboard → converts → copies cURL back to clipboard.
 */
(() => {
  if (document.getElementById('mvax-curl-root')) return;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    :host { all: initial; }

    :host {
      --bg:        rgba(12, 12, 20, .94);
      --surface:   rgba(255,255,255, .04);
      --surface-h: rgba(255,255,255, .07);
      --border:    rgba(255,255,255, .07);
      --text:      #e2e8f0;
      --dim:       #64748b;
      --red:       #ef4444;
      --red-l:     #f87171;
      --green:     #34d399;
      --radius:    12px;
      --font:      'Inter', system-ui, -apple-system, sans-serif;
      --mono:      'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, monospace;
    }

    /* ── fab ──────────────────────────────────────────────────────── */
    #mvax-fab {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 2147483647;
      height: 36px;
      padding: 0 14px;
      border-radius: 20px;
      border: 1px solid rgba(239,68,68,.25);
      background: linear-gradient(135deg, rgba(239,68,68,.15), rgba(239,68,68,.06));
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--red-l);
      font-family: var(--font);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      box-shadow: 0 2px 12px rgba(0,0,0,.25);
      transition: all .2s cubic-bezier(.4,0,.2,1);
      user-select: none;
    }
    #mvax-fab svg { width: 14px; height: 14px; flex-shrink: 0; }
    #mvax-fab:hover {
      background: linear-gradient(135deg, rgba(239,68,68,.25), rgba(239,68,68,.12));
      border-color: rgba(239,68,68,.4);
      box-shadow: 0 4px 20px rgba(239,68,68,.2);
      transform: translateY(-1px);
    }
    #mvax-fab.active {
      background: rgba(239,68,68,.2);
      border-color: rgba(239,68,68,.4);
      color: #fca5a5;
    }

    /* ── panel ────────────────────────────────────────────────────── */
    #mvax-panel {
      position: fixed;
      top: 58px;
      right: 14px;
      z-index: 2147483647;
      width: 580px;
      max-height: calc(100vh - 74px);
      overflow-y: auto;
      background: var(--bg);
      backdrop-filter: blur(24px) saturate(1.8);
      -webkit-backdrop-filter: blur(24px) saturate(1.8);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,.45),
                  0 0 0 1px rgba(255,255,255,.03) inset;
      font-family: var(--font);
      color: var(--text);
      opacity: 0;
      transform: translateY(-6px) scale(.98);
      pointer-events: none;
      transition: opacity .22s cubic-bezier(.4,0,.2,1),
                  transform .22s cubic-bezier(.4,0,.2,1);
    }
    #mvax-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* ── header ───────────────────────────────────────────────────── */
    .mvax-hdr {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
    }
    .mvax-hdr-icon {
      width: 30px; height: 30px; border-radius: 9px;
      background: linear-gradient(135deg, #dc2626, #f87171);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .mvax-hdr-icon svg { width: 16px; height: 16px; color: #fff; }
    .mvax-hdr-txt { flex: 1; }
    .mvax-hdr-txt h2 { margin: 0; font-size: 14px; font-weight: 700; color: #f8fafc; }
    .mvax-hdr-txt p  { margin: 2px 0 0; font-size: 11px; color: var(--dim); }
    .mvax-hdr-close {
      width: 28px; height: 28px; border-radius: 8px;
      border: 1px solid var(--border); background: transparent;
      color: var(--dim); font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s;
    }
    .mvax-hdr-close:hover { background: var(--surface-h); color: var(--text); }

    /* ── body ─────────────────────────────────────────────────────── */
    .mvax-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }

    /* ── actions ──────────────────────────────────────────────────── */
    .mvax-actions { display: flex; gap: 8px; }
    .mvax-btn {
      flex: 1; height: 40px; border: none; border-radius: 10px;
      font-family: var(--font); font-size: 12px; font-weight: 600;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: all .15s cubic-bezier(.4,0,.2,1);
    }
    .mvax-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
    .mvax-btn-primary {
      background: linear-gradient(135deg, #dc2626, #ef4444);
      color: #fff;
      box-shadow: 0 2px 8px rgba(239,68,68,.25);
    }
    .mvax-btn-primary:hover {
      box-shadow: 0 4px 16px rgba(239,68,68,.4);
      transform: translateY(-1px);
    }
    .mvax-btn-ghost {
      background: var(--surface); color: var(--text);
      border: 1px solid var(--border);
    }
    .mvax-btn-ghost:hover { background: var(--surface-h); transform: translateY(-1px); }
    .mvax-btn:disabled { opacity: .3; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
    .mvax-btn-icon {
      width: 40px; height: 40px; flex: 0 0 40px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; color: var(--dim); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s;
    }
    .mvax-btn-icon svg { width: 14px; height: 14px; }
    .mvax-btn-icon:hover { background: rgba(248,113,113,.1); color: var(--red-l); }

    /* ── status toast ─────────────────────────────────────────────── */
    #mvax-status {
      min-height: 0; font-size: 11px; font-weight: 500;
      text-align: center; transition: color .15s;
    }
    #mvax-status:empty { display: none; }
    #mvax-status.ok  { color: var(--green); }
    #mvax-status.err { color: var(--red-l); }

    /* ── url bar (hidden until conversion) ────────────────────────── */
    #mvax-url-bar {
      display: none;
      align-items: center; gap: 8px;
      padding: 8px 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    #mvax-url-bar.show { display: flex; }
    #mvax-url-bar .url-label {
      font-size: 10px; font-weight: 700; color: var(--red-l);
      text-transform: uppercase; letter-spacing: .05em;
      flex-shrink: 0;
    }
    #mvax-url-bar .url-value {
      font-family: var(--mono); font-size: 11px; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      flex: 1;
    }

    /* ── api name + http status badges ────────────────────────────── */
    #mvax-meta {
      display: none; gap: 8px; flex-wrap: wrap;
    }
    #mvax-meta.show { display: flex; }
    .mvax-badge {
      font-size: 10px; font-weight: 600; padding: 3px 10px;
      border-radius: 20px; letter-spacing: .02em;
    }
    .mvax-badge-api  { background: rgba(239,68,68,.12); color: var(--red-l); }
    .mvax-badge-ok   { background: rgba(52,211,153,.12); color: var(--green); }
    .mvax-badge-fail { background: rgba(248,113,113,.15); color: var(--red-l); }
    .mvax-badge-ms   { background: var(--surface); color: var(--dim); border: 1px solid var(--border); }

    /* ── output (hidden until conversion) ─────────────────────────── */
    #mvax-result { display: none; flex-direction: column; gap: 8px; }
    #mvax-result.show { display: flex; }

    .mvax-lbl {
      font-size: 11px; font-weight: 600; color: var(--dim);
      text-transform: uppercase; letter-spacing: .06em;
    }

    #mvax-output {
      width: 100%; min-height: 80px; max-height: 280px;
      overflow: auto; margin: 0;
      padding: 12px 14px;
      background: rgba(0,0,0,.25);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: var(--mono); font-size: 11px; line-height: 1.65;
      color: var(--green);
      white-space: pre-wrap; word-break: break-all;
    }

    /* ── divider ──────────────────────────────────────────────────── */
    .mvax-divider { height: 1px; background: var(--border); margin: 2px 0; }

    /* ── footer ───────────────────────────────────────────────────── */
    .mvax-footer {
      padding: 10px 18px;
      border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      font-size: 10px; color: var(--dim); opacity: .5;
    }
  `;

  /* ── icons ──────────────────────────────────────────────────────── */
  const ICON = {
    term:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    copy:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  };

  /* ── DOM ─────────────────────────────────────────────────────────── */
  const host = document.createElement('div');
  host.id = 'mvax-curl-root';
  const shadow = host.attachShadow({ mode: 'closed' });

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  const fab = document.createElement('button');
  fab.id = 'mvax-fab';
  fab.innerHTML = `${ICON.term}<span>Log → cURL</span>`;
  fab.title = 'MVAX Log → cURL';
  shadow.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'mvax-panel';
  panel.innerHTML = `
    <div class="mvax-hdr">
      <div class="mvax-hdr-icon">${ICON.term}</div>
      <div class="mvax-hdr-txt">
        <h2>MVAX Log → cURL</h2>
        <p>Copy an audit log line, then click Paste & Convert</p>
      </div>
      <button class="mvax-hdr-close" id="mvax-close" title="Close">✕</button>
    </div>

    <div class="mvax-body">
      <div class="mvax-actions">
        <button class="mvax-btn mvax-btn-primary" id="mvax-paste-convert">${ICON.paste} Paste & Convert</button>
        <button class="mvax-btn mvax-btn-ghost"   id="mvax-copy" disabled>${ICON.copy} Copy cURL</button>
        <button class="mvax-btn-icon"              id="mvax-clear" title="Clear">${ICON.trash}</button>
      </div>

      <div id="mvax-status"></div>

      <div id="mvax-url-bar">
        <span class="url-label">URL</span>
        <span class="url-value" id="mvax-url"></span>
      </div>

      <div id="mvax-meta">
      </div>

      <div id="mvax-result">
        <div class="mvax-divider"></div>
        <div class="mvax-lbl">cURL Output</div>
        <pre id="mvax-output"></pre>
      </div>
    </div>

    <div class="mvax-footer">
      <span>MVAX Audit Tool — by Sultan</span>
      <span>v2.0</span>
    </div>
  `;
  shadow.appendChild(panel);
  document.body.appendChild(host);

  /* ── refs ────────────────────────────────────────────────────────── */
  const pasteBtn = shadow.getElementById('mvax-paste-convert');
  const copyBtn  = shadow.getElementById('mvax-copy');
  const clearBtn = shadow.getElementById('mvax-clear');
  const closeBtn = shadow.getElementById('mvax-close');
  const statusEl = shadow.getElementById('mvax-status');
  const urlBar   = shadow.getElementById('mvax-url-bar');
  const urlVal   = shadow.getElementById('mvax-url');
  const metaEl   = shadow.getElementById('mvax-meta');
  const resultEl = shadow.getElementById('mvax-result');
  const outputEl = shadow.getElementById('mvax-output');

  let lastCurl = '';

  /* ── toggle panel ───────────────────────────────────────────────── */
  function togglePanel(forceOpen) {
    const opening = forceOpen !== undefined ? forceOpen : !panel.classList.contains('open');
    panel.classList.toggle('open', opening);
    fab.classList.toggle('active', opening);
    fab.innerHTML = opening
      ? '<span>✕ Close</span>'
      : `${ICON.term}<span>Log → cURL</span>`;
  }

  /* ── paste & convert (one click does everything) ────────────────── */
  async function pasteAndConvert() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showStatus('Clipboard is empty — copy a log line first.', false);
        return;
      }

      // Parse JSON from the log
      const start = text.indexOf('{');
      const end   = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) throw new Error('No JSON found in clipboard');
      const json = JSON.parse(text.substring(start, end + 1));

      // Show URL
      const url = json.requestURL || '';
      urlVal.textContent = url;
      urlBar.classList.add('show');

      // Show meta badges
      const apiName    = json.mvaxApiName || '';
      const httpStatus = json.responseHttpStatus;
      const duration   = json.requestDurationinMS || '';
      const success    = json.success;
      metaEl.innerHTML = '';
      if (apiName)    metaEl.innerHTML += `<span class="mvax-badge mvax-badge-api">${apiName}</span>`;
      if (httpStatus) metaEl.innerHTML += `<span class="mvax-badge ${success ? 'mvax-badge-ok' : 'mvax-badge-fail'}">${httpStatus}</span>`;
      if (duration)   metaEl.innerHTML += `<span class="mvax-badge mvax-badge-ms">${duration} ms</span>`;
      metaEl.classList.add('show');

      // Convert to cURL
      lastCurl = CurlPrinter.fromAuditLog(text);
      outputEl.textContent = lastCurl;
      resultEl.classList.add('show');
      copyBtn.disabled = false;

      // Auto-copy cURL to clipboard
      copyToClipboard(lastCurl);

      // Feedback
      const prev = pasteBtn.innerHTML;
      pasteBtn.innerHTML = `${ICON.check} cURL ready in clipboard!`;
      showStatus('✓ Copied to clipboard', true);
      setTimeout(() => { pasteBtn.innerHTML = prev; }, 2000);

    } catch (err) {
      lastCurl = '';
      copyBtn.disabled = true;
      resultEl.classList.remove('show');
      urlBar.classList.remove('show');
      metaEl.classList.remove('show');
      showStatus('Error: ' + err.message, false);
    }
  }

  /* ── copy ────────────────────────────────────────────────────────── */
  function copyResult() {
    if (!lastCurl) return;
    copyToClipboard(lastCurl);
    const prev = copyBtn.innerHTML;
    copyBtn.innerHTML = `${ICON.check} Copied!`;
    showStatus('Copied to clipboard', true);
    setTimeout(() => { copyBtn.innerHTML = prev; }, 1500);
  }

  /* ── clear ───────────────────────────────────────────────────────── */
  function clearAll() {
    lastCurl = '';
    copyBtn.disabled = true;
    resultEl.classList.remove('show');
    urlBar.classList.remove('show');
    metaEl.classList.remove('show');
    metaEl.innerHTML = '';
    outputEl.textContent = '';
    statusEl.textContent = '';
    statusEl.className = '';
  }

  /* ── helpers ─────────────────────────────────────────────────────── */
  function copyToClipboard(text) {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;left:-9999px';
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function showStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.className = ok ? 'ok' : 'err';
  }

  /* ── events ─────────────────────────────────────────────────────── */
  fab.addEventListener('click', () => togglePanel());
  closeBtn.addEventListener('click', () => togglePanel(false));
  pasteBtn.addEventListener('click', pasteAndConvert);
  copyBtn.addEventListener('click', copyResult);
  clearBtn.addEventListener('click', clearAll);
})();
