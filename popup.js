const PASS = 'ebaad';
const $ = id => document.getElementById(id);

chrome.storage.local.get(['popupUnlocked','apiKey','model','autoMode','autoSubmit'], d => {
  if (d.popupUnlocked) showMain(d);
  if (d.apiKey) $('apiKey').value = d.apiKey;
  if (d.model)  $('model').value  = d.model;
  if (d.autoMode) $('autoMode').checked = true;
  if (d.autoSubmit) $('autoSubmit').checked = true;
  if (d.apiKey) status('ok', 'API key loaded ✓');
});

$('lockBtn').addEventListener('click', tryUnlock);
$('lockPass').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

function tryUnlock() {
  if ($('lockPass').value === PASS) {
    chrome.storage.local.set({ popupUnlocked: true });
    chrome.storage.local.get(['apiKey','model','autoMode','autoSubmit'], showMain);
  } else {
    $('lockErr').textContent = '❌ Incorrect password';
    $('lockPass').value = '';
    $('lockPass').classList.add('shake');
    setTimeout(() => $('lockPass').classList.remove('shake'), 500);
  }
}

function showMain(d) {
  $('lockScreen').style.display = 'none';
  $('mainUI').style.display = 'block';
  if (d.apiKey) { $('apiKey').value = d.apiKey; status('ok', 'API key loaded ✓'); }
  if (d.model)  $('model').value = d.model;
  if (d.autoMode) $('autoMode').checked = true;
  if (d.autoSubmit) $('autoSubmit').checked = true;
}

$('eyeBtn').addEventListener('click', () => {
  $('apiKey').type = $('apiKey').type === 'password' ? 'text' : 'password';
});

$('saveBtn').addEventListener('click', () => {
  const key = $('apiKey').value.trim();
  if (!key) { status('err', '❌ Enter an API key!'); return; }
  chrome.storage.local.set({
    apiKey: key, model: $('model').value,
    autoMode: $('autoMode').checked, autoSubmit: $('autoSubmit').checked, botEnabled: true
  }, () => {
    status('ok', '✅ Saved!');
    chrome.tabs.query({ active: true, currentWindow: true }, ts => {
      if (ts[0]?.id) chrome.tabs.sendMessage(ts[0].id, {
        type: 'TOGGLE_BOT', enabled: true,
        auto: $('autoMode').checked, autoSubmit: $('autoSubmit').checked
      }).catch(() => {});
    });
  });
});

$('solveBtn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ts => {
    if (!ts[0]?.id) { status('err', '❌ No active tab'); return; }
    const url = ts[0].url || '';
    if (!url.includes('sparxscience.com') && !url.includes('sparx-learning.com')) {
      status('err', '❌ Not on Sparx Science!'); return;
    }
    chrome.tabs.sendMessage(ts[0].id, { type: 'SOLVE_NOW' }, () => {
      if (chrome.runtime.lastError) { status('err', '❌ Could not reach page'); return; }
      status('ok', '⚡ Solving…');
      setTimeout(() => window.close(), 400);
    });
  });
});

$('lockBtnMain').addEventListener('click', () => {
  chrome.storage.local.set({ popupUnlocked: false, unlocked: false });
  $('mainUI').style.display = 'none';
  $('lockScreen').style.display = 'flex';
  $('lockPass').value = ''; $('lockErr').textContent = '';
  setTimeout(() => $('lockPass').focus(), 50);
});

function status(type, text) {
  $('dot').className = 'dot' + (type==='ok'?' ok':type==='err'?' err':'');
  $('msg').textContent = text;
}
