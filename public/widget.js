(function () {
  var script = document.currentScript;
  if (!script) return;
  var botId = script.getAttribute('data-bot-id');
  if (!botId) return;
  var autoOpen = script.getAttribute('data-open') === 'true';
  var baseUrl = new URL(script.src, window.location.href).origin;

  var conversationId = '';
  var accentColor = '#1D4ED8';
  var isOpen = autoOpen;

  var host = document.createElement('div');
  host.id = 'kresna-widget-host';
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent =
    '.kw-btn{position:fixed;bottom:20px;right:20px;z-index:99999;width:56px;height:56px;border-radius:9999px;border:none;color:#fff;cursor:pointer;box-shadow:0 10px 25px rgba(15,23,42,.22);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-size:22px}' +
    '.kw-panel{position:fixed;bottom:88px;right:20px;z-index:99999;width:370px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.2);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,sans-serif}' +
    '.kw-panel.open{display:flex}' +
    '.kw-head{padding:14px 16px;color:#fff;display:flex;justify-content:space-between;align-items:center}' +
    '.kw-title{font-weight:700;font-size:15px;margin:0}.kw-sub{font-size:11px;opacity:.85;margin-top:2px}' +
    '.kw-close{background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;padding:4px 8px}' +
    '.kw-msgs{flex:1;overflow-y:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}' +
    '.kw-msg{max-width:85%;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap}' +
    '.kw-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#0f172a}' +
    '.kw-msg.user{align-self:flex-end;color:#fff}' +
    '.kw-fb{display:flex;gap:6px;margin-top:6px}.kw-fb button{font-size:11px;padding:2px 6px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer}' +
    '.kw-followups{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:92%}' +
    '.kw-followup-btn{font-size:11px;padding:5px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer;text-align:left}' +
    '.kw-followup-btn:hover{border-color:#2563eb;color:#1d4ed8}' +
    '.kw-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff}' +
    '.kw-input{flex:1;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:13px;outline:none}' +
    '.kw-send{border:none;border-radius:10px;padding:8px 14px;color:#fff;font-weight:600;font-size:13px;cursor:pointer}';
  shadow.appendChild(style);

  var panel = document.createElement('div');
  panel.className = 'kw-panel' + (isOpen ? ' open' : '');
  panel.innerHTML =
    '<div class="kw-head"><div><div class="kw-title">Asisten KRESNA</div><div class="kw-sub">Online</div></div><button class="kw-close" aria-label="Tutup">×</button></div>' +
    '<div class="kw-msgs"></div>' +
    '<form class="kw-form"><input class="kw-input" placeholder="Tulis pertanyaan Anda..." /><button class="kw-send" type="submit">Kirim</button></form>';
  shadow.appendChild(panel);

  var btn = document.createElement('button');
  btn.className = 'kw-btn';
  btn.setAttribute('aria-label', 'Buka chat asisten');
  btn.textContent = '💬';
  shadow.appendChild(btn);

  var headEl = panel.querySelector('.kw-head');
  var titleEl = panel.querySelector('.kw-title');
  var subEl = panel.querySelector('.kw-sub');
  var msgsEl = panel.querySelector('.kw-msgs');
  var formEl = panel.querySelector('.kw-form');
  var inputEl = panel.querySelector('.kw-input');
  var sendEl = panel.querySelector('.kw-send');
  var closeEl = panel.querySelector('.kw-close');

  function applyTheme(color) {
    accentColor = color || '#1D4ED8';
    btn.style.background = accentColor;
    headEl.style.background = accentColor;
    sendEl.style.background = accentColor;
  }
  applyTheme(accentColor);

  function addMsg(role, text, messageId, suggestedFollowups) {
    var div = document.createElement('div');
    div.className = 'kw-msg ' + (role === 'user' ? 'user' : 'bot');
    if (role === 'user') div.style.background = accentColor;
    div.textContent = text;
    if (role === 'bot' && messageId) {
      var fb = document.createElement('div');
      fb.className = 'kw-fb';
      ['up', 'down'].forEach(function (val) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = val === 'up' ? '👍' : '👎';
        b.onclick = function () {
          fetch(baseUrl + '/api/widget/' + encodeURIComponent(botId) + '/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: messageId, feedback: val }),
          });
          b.style.borderColor = accentColor;
        };
        fb.appendChild(b);
      });
      div.appendChild(fb);
    }
    msgsEl.appendChild(div);

    if (role === 'bot' && Array.isArray(suggestedFollowups) && suggestedFollowups.length > 0) {
      var pills = document.createElement('div');
      pills.className = 'kw-followups';
      suggestedFollowups.forEach(function (q) {
        var pBtn = document.createElement('button');
        pBtn.type = 'button';
        pBtn.className = 'kw-followup-btn';
        pBtn.textContent = q;
        pBtn.onclick = function () {
          sendMessage(q);
        };
        pills.appendChild(pBtn);
      });
      msgsEl.appendChild(pills);
    }

    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }

  function sendMessage(text) {
    var trimmed = (text || '').trim();
    if (!trimmed) return;
    addMsg('user', trimmed);
    var botBubble = addMsg('bot', 'Sedang memeriksa...');

    fetch(baseUrl + '/api/widget/' + encodeURIComponent(botId) + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: trimmed, conversationId: conversationId || undefined }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          botBubble.textContent = data.error;
          return;
        }
        if (data.conversationId) conversationId = data.conversationId;
        botBubble.remove();
        addMsg('bot', data.assistantMessage.content, data.assistantMessage.id, data.suggestedFollowups);
      })
      .catch(function () {
        botBubble.textContent = 'Koneksi terputus. Silakan coba lagi sebentar ya.';
      });
  }

  btn.onclick = function () {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
  };
  closeEl.onclick = function () {
    isOpen = false;
    panel.classList.remove('open');
  };

  fetch(baseUrl + '/api/widget/' + encodeURIComponent(botId) + '/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (cfg.error) {
        addMsg('bot', cfg.error);
        return;
      }
      applyTheme(cfg.accentColor);
      titleEl.textContent = cfg.title || cfg.name || 'Asisten KRESNA';
      subEl.textContent = cfg.subtitle || 'Online · Siap membantu';
      if (cfg.welcomeMessage) addMsg('bot', cfg.welcomeMessage);
    })
    .catch(function () {
      addMsg('bot', 'Gagal memuat konfigurasi widget.');
    });

  formEl.onsubmit = function (e) {
    e.preventDefault();
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendMessage(text);
  };
})();
