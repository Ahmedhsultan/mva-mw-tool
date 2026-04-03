const pasteBtn  = document.getElementById('pasteBtn');
const copyBtn   = document.getElementById('copyBtn');
const statusEl  = document.getElementById('status');
const outputEl  = document.getElementById('output');

let lastCurl = '';

/**
 * Read text from the clipboard using a hidden textarea + execCommand('paste').
 * navigator.clipboard.readText() is blocked in extension popups.
 */
function readClipboard() {
  const ta = document.createElement('textarea');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  document.execCommand('paste');
  const text = ta.value;
  document.body.removeChild(ta);
  return text;
}

/**
 * Write text to the clipboard using a hidden textarea + execCommand('copy').
 */
function writeClipboard(text) {
  const ta = document.createElement('textarea');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

pasteBtn.addEventListener('click', () => {
  try {
    const text = readClipboard();
    if (!text || !text.trim()) {
      showStatus('Clipboard is empty.', true);
      return;
    }

    lastCurl = CurlPrinter.fromAuditLog(text);
    outputEl.textContent = lastCurl;
    copyBtn.disabled = false;
    showStatus('cURL generated successfully!', false);
  } catch (err) {
    lastCurl = '';
    copyBtn.disabled = true;
    outputEl.textContent = '';
    showStatus('Error: ' + err.message, true);
  }
});

copyBtn.addEventListener('click', () => {
  if (!lastCurl) return;
  try {
    writeClipboard(lastCurl);
    showStatus('Copied to clipboard!', false);
  } catch (err) {
    showStatus('Failed to copy: ' + err.message, true);
  }
});

function showStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : 'success';
}


