'use strict';
/* PONTE Villetta Color Sort: GameBull hooks, loaded after the client's home.js (their files unchanged). Classic scripts
 * share globals, so their top-level functions (render, startAuthorized) can be wrapped and their lets read and set
 * (bottles, trace, moves, playing, current). What this adds, all for GameBull Stage Mode only:
 *  - board save and resume: every move is kept with the attempt (gb/ponte-host.js, sessionStorage), and a reload that
 *    reuses the attempt puts the board back as it was, never the starting board (their GAMEBULL-INTEGRATION.md asks
 *    for this: no rewind to the initial position on a reload);
 *  - the attempt's time limit (GameBull requires one, at most 59 min): a small line under their stats in the last
 *    10 minutes; at 0 the attempt ends through their own GAME OVER dialog and endParticipation();
 *  - the all-clear voucher (stage 1000, status from the server) inside their クリア！ dialog, whose button closes the
 *    game into the GameBull app's coupon (gamebull:close + to: /coupons/<id>, relayed by the loading page; trap W18);
 *  - a "back to GameBull" button under their START when the game cannot start (Game Start launch, no launch data);
 *  - the loading page signal once their pictures are loaded, and audioSession "playback" on the first tap (trap W2).
 */
(function () {
  const ENV = window.PONTE_GB || {};
  const gb = () => window.PonteGB;
  const log = (...a) => console.log('[PV-GB]', ...a);
  log(`Build v${ENV.build} (${ENV.gameId}, API ${ENV.apiBase}).`);

  function closeToGameBull(to) {
    if (!gb().embedded) return false;
    const msg = { type: 'gamebull:close' }; if (to) msg.to = to;
    log('gamebull:close ' + JSON.stringify(msg) + ' (through the loading page relay).');
    window.parent.postMessage(msg, location.origin);
    return true;
  }

  /* ── styles for the few GameBull elements (scoped to .pvgb-*, trap W10; colours from their lounge.css) ── */
  const css = document.createElement('style');
  css.textContent = `
  .pvgb-timer{display:block;width:max-content;margin:8px auto 0;padding:3px 12px;border:1px solid #b886415e;border-radius:999px;
    background:#090d13b8;color:#f5dcac;font:600 12px/1.5 system-ui,sans-serif;letter-spacing:1px;font-variant-numeric:tabular-nums}
  .pvgb-timer[hidden]{display:none}
  .pvgb-timer.pvgb-low{border-color:#e0705a;color:#ffb4a2}
  .pvgb-reward{margin:14px 0 4px;padding:12px 10px;border-top:1px solid #c79a5255;font:13px/1.6 system-ui,sans-serif;color:#d6c19f}
  .pvgb-reward[hidden]{display:none}
  .pvgb-reward h3{margin:0 0 4px;font:600 16px/1.4 Georgia,serif;color:#f3ddb3}
  .pvgb-reward p{margin:4px 0;font-size:13px}
  .pvgb-reward img{display:block;max-width:100%;max-height:140px;margin:8px auto;border-radius:6px}
  .pvgb-reward button{margin-top:8px}
  .pvgb-back{display:block;margin:10px auto 6px}
  /* fixed window: the loading page scales this frame so their whole page fits (loader.ts fitFrame); no scrollbar */
  html{overflow:hidden;scrollbar-width:none}
  html::-webkit-scrollbar{display:none}`;
  document.head.appendChild(css);

  /* ── board save: after their render, the attempt's moves (their trace) go to the host ── */
  let restoring = false;
  const theirRender = render;
  render = function () {
    theirRender.apply(this, arguments);
    if (!restoring && playing && gb()) gb().saveMoves(trace);
  };

  /* ── board resume: their startAuthorized deals the starting board; a reused attempt gets its moves back ── */
  const theirStart = startAuthorized;
  startAuthorized = function (n) {
    restoring = true;
    try { theirStart.apply(this, arguments); } finally { restoring = false; }
    const a = gb() && gb().takeResume();
    if (!a || a.stage !== n + 1 || !a.moves.length) return;
    const board = gb().replay(a.stage, a.moves);
    if (!board) { log(`Stage ${a.stage}: saved moves do not replay; the board stays at the start.`); return; }
    bottles = board; trace = a.moves.map(m => ({ from: m.from, to: m.to, units: m.units })); moves = trace.length;
    render();
    log(`Stage ${a.stage}: board restored after a reload (${moves} moves).`);
    if (won()) {
      // Cleared before the reload, report not confirmed yet: their own confirmation and dialog (same report resent).
      confirmCompletion(); if (!$('win').open) $('win').showModal();
    } else checkDeadlock();
  };

  /* ── time limit: a line under their stats in the last 10 minutes; at 0, their GAME OVER ends the attempt ── */
  const SHOW_LAST_MS = 600000;
  const timer = document.createElement('span');
  timer.className = 'pvgb-timer'; timer.hidden = true; timer.setAttribute('aria-live', 'off');
  const stats = document.querySelector('main .stats'); if (stats) stats.after(timer);
  const fmt = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function timeUp() {
    if (!playing || won() || submitting || pouring || ending) return;
    log(`Stage ${current + 1}: attempt time limit reached; ending it.`);
    stopDeadlockCheck(); playing = false; clearCelebration();
    $('gameover-result').textContent = '制限時間を過ぎました。';
    if (!$('gameover').open) $('gameover').showModal();
    endParticipation();
  }
  setInterval(() => {
    const a = gb() && gb().active;
    const on = !!(a && playing && !a.clearBody && participation.attempt && participation.attempt.attemptId === a.attemptId && !won());
    const left = on ? gb().remainingMs() : 0;
    timer.hidden = !on || left > SHOW_LAST_MS;
    if (!on) return;
    timer.textContent = '残り時間 ' + fmt(left);
    timer.classList.toggle('pvgb-low', left <= 60000);
    if (left <= 0) timeUp();
  }, 250);

  /* ── the all-clear voucher inside their クリア！ dialog (their <dialog> is in the top layer, trap W16) ── */
  const safeUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u : null; } catch { return null; } };
  const box = document.createElement('div'); box.className = 'pvgb-reward'; box.hidden = true;
  const result = $('result'); if (result) result.after(box);
  addEventListener('ponte-gb:clear', e => {
    const reward = e.detail && e.detail.reward;
    if (!reward) return;
    const text = { ISSUED: 'ギフト券が発行され、GameBullのクーポン一覧に入りました。', ALREADY_CLAIMED: 'この店舗の特典はすでに受け取り済みです。',
      NONE_CONFIGURED: '', OUT_OF_STOCK: '特典は一時的に在庫切れです。後でGameBullアプリのゲーム画面から受け取れます。' }[reward.status] ?? '特典の状態はGameBullでご確認ください。';
    box.replaceChildren();
    const add = (tag, value) => { if (!value) return; const el = document.createElement(tag); el.textContent = value; box.append(el); };
    if (reward.status !== 'NONE_CONFIGURED') add('h3', reward.title || '全ステージ達成特典');
    add('p', text); if (reward.status !== 'NONE_CONFIGURED') add('p', reward.benefit);
    const img = safeUrl(reward.imageUrl);
    if (img && reward.status !== 'NONE_CONFIGURED') { const im = new Image(); im.alt = reward.title || '全ステージ達成特典'; im.referrerPolicy = 'no-referrer'; im.src = img.href; box.append(im); }
    const redeem = reward.status === 'ISSUED' && safeUrl(reward.redeemUrl);
    if (redeem) {
      const b = document.createElement('button'); b.className = 'action primary'; b.type = 'button'; b.textContent = 'GameBullでギフト券を開く';
      // Inside the app the frame has no allow-popups: close the game and let the app open the coupon
      // (gamebull-whitelabel d85807c honours to: /coupons/<id>). Outside the app, open the wallet link.
      b.onclick = () => { const m = /^\/coupons\/[^/?#]+$/.exec(redeem.pathname); if (!closeToGameBull(m ? m[0] : undefined)) window.open(redeem.href, '_blank', 'noopener,noreferrer'); };
      box.append(b);
    }
    box.hidden = !box.childNodes.length;
    log('All-clear reward: ' + reward.status + '.');
  });

  /* ── start-up check: a launch that cannot play says so under their START, with a way back to GameBull ── */
  participation.progress().then(p => log(`Progress ${p.completedStages} / 1000.`)).catch(e => {
    log('Start-up message: ' + e.message);
    if (!$('home-error').textContent) $('home-error').textContent = e.message;
    if (gb().embedded && !document.querySelector('.pvgb-back') && e.code !== 'network') {
      const b = document.createElement('button'); b.className = 'action pvgb-back'; b.type = 'button'; b.textContent = 'GameBullに戻る';
      b.onclick = () => closeToGameBull(); $('home-error').after(b);
    }
  });

  /* ── loading page down once their pictures are in (their TOP art and the lounge backdrop) ── */
  const pictures = ['assets/lounge-night.png', 'assets/hookah.png', 'assets/lounge.png'];
  let loaded = 0;
  const progress = p => { try { window.parent.gbLoaderProgress && window.parent.gbLoaderProgress(p); } catch { /* not in our frame */ } };
  let signalled = false;
  const done = () => { if (signalled) return; signalled = true; try { window.parent.gbLoaderDone && window.parent.gbLoaderDone(); } catch { /* not in our frame */ } };
  Promise.all(pictures.map(src => new Promise(res => { const im = new Image(); im.onload = im.onerror = () => { progress(++loaded / pictures.length); res(); }; im.src = src; })))
    .then(() => { progress(1); done(); });
  setTimeout(done, 15000); // never keep the loading page up on a picture that will not come

  /* ── iPhone: Web Audio plays with the silent switch on (trap W2); their own audio.js starts on the same tap ── */
  document.addEventListener('pointerdown', () => { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* n/a */ } }, { capture: true, once: true });
})();
