const $ = id => document.getElementById(id);

chrome.storage.local.get(['apiKey','model','autoMode','autoSubmit'], d => {
  if (d.apiKey)     { $('apiKey').value = d.apiKey; status('ok','API key loaded ✓'); }
  if (d.model)      $('model').value = d.model;
  if (d.autoMode)   $('autoMode').checked = true;
  if (d.autoSubmit) $('autoSubmit').checked = true;
});

$('eye').onclick = () => $('apiKey').type = $('apiKey').type === 'password' ? 'text' : 'password';

$('save').onclick = () => {
  const key = $('apiKey').value.trim();
  if (!key) { status('err','Enter an API key first!'); return; }
  chrome.storage.local.set({ apiKey:key, model:$('model').value, autoMode:$('autoMode').checked, autoSubmit:$('autoSubmit').checked, botEnabled:true }, () => {
    status('ok','Saved ✓');
    chrome.tabs.query({active:true,currentWindow:true}, ts => {
      if (ts[0]?.id) chrome.tabs.sendMessage(ts[0].id, { type:'TOGGLE_BOT', enabled:true, auto:$('autoMode').checked }).catch(()=>{});
    });
  });
};

$('solve').onclick = () => {
  chrome.tabs.query({active:true,currentWindow:true}, ts => {
    if (!ts[0]?.id) { status('err','No active tab'); return; }
    chrome.tabs.sendMessage(ts[0].id, { type:'SOLVE_NOW' }, () => {
      if (chrome.runtime.lastError) { status('err','Not on Sparx Science page'); return; }
      status('ok','Solving…'); window.close();
    });
  });
};

function status(type, msg) {
  $('dot').className = 'dot' + (type==='ok'?' ok':type==='err'?' err':'');
  $('msg').textContent = msg;
}
