'use strict';
/* PONTE Villetta Color Sort: window.GameBullIntegration on the real GameBull Stage Mode API.
 *
 * The client's own host boundary (their GAMEBULL-INTEGRATION.md): their gamebull.js, in its default mode:'gamebull',
 * calls window.GameBullIntegration.getProgress / enterStage / completeStage / endStage and checks every answer.
 * Their contract was a proposal, not a GameBull API, so this file maps it onto the API the other Stage Mode games use
 * (gamebull-whitelabel ADR-0086, contracts/stage-mode.ts; the Stance, Himi Kiju and Niigata ports):
 *
 *   getProgress     GET  /play/games/{gameId}/context?tenantSlug   (Bearer bootToken) -> stageMode.highestCleared
 *   enterStage      POST /play/plays {bootToken, stage}            1 Life on the server (PAID; their game only ever
 *                                                                   asks for nextStage)
 *   completeStage   their moves replayed on their own LEVELS with their own pour rule, then
 *                   POST /play/stage-clears {sessionToken, playTimeMs} -> status, progress, the all-clear reward
 *   endStage        no GameBull endpoint: the attempt is closed here and never reused; the next entry is a new
 *                   POST /play/plays, which costs 1 Life on the server (stage is still nextStage)
 *
 * What their contract asks that the API does not have, and what this file does instead:
 *  - idempotent entries (idempotencyKey): the API has no idempotency key. A running attempt is kept in
 *    sessionStorage (with its play token), so the same key, a reload or TOP -> START reuse it with no second Life;
 *    an entry still in flight is awaited, not sent again. An entry whose answer was lost (network / 5xx) is never
 *    re-sent: the player is told a Life may have been used (with the server's Lives), and the next START is a new entry;
 *  - move proof: GameBull does not replay moves. Their move list is replayed here before a clear is reported
 *    (not authoritative: it runs in the browser);
 *  - board save on reload: kept with the attempt in sessionStorage (gb/ponte-hooks.js restores it);
 *  - stage data version pinning: the server does not know it; the admin must be set to 1000 stages (checked);
 *  - deadlineAt: GameBull requires a time per attempt (maxAttemptSeconds, max 3540 s); gb/ponte-hooks.js shows it
 *    near the end and closes the attempt when it runs out.
 * Lives are never counted here: the balance is the server's (/context lives.count).
 */
(function () {
  const ENV = window.PONTE_GB || {};
  const TOTAL = 1000; // their game: gamebull.js and game.js hard-code 1,000 stages
  const log = (...a) => console.log('[PV-GB]', ...a);
  const q = new URLSearchParams(location.search);
  // The GameBull app launches with ?tenantSlug&bootToken&gameId&returnUrl&apiBase (use-launch-game.ts); the other
  // ports' SDK also accepts sessionToken / token, in that order (playbook section 2).
  const token = q.get('bootToken') || q.get('sessionToken') || q.get('token') || '';
  const tenant = q.get('tenantSlug') || '';
  const api = ((ENV.dev && q.get('devApi')) || ENV.apiBase || '').replace(/\/+$/, '');
  const jwtPayload = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
  const player = (jwtPayload(token) || {}).globalUserId || 'unknown';
  const KEY = 'ponte-gb:v1:' + tenant + ':' + ENV.gameId + ':' + player;

  class StageError extends Error { constructor(code, message) { super(message); this.name = 'StageError'; this.code = code; } }
  // Server codes -> Japanese for their message line (#home-error / #result). Their own wording where they have one
  // (GAMEBULL-INTEGRATION.md: 'ライフが不足しています'), else the same wording as the Stance / Himi Kiju Stage Mode screens.
  const MESSAGES = {
    'play.no_lives': 'ライフが不足しています。GameBullでライフをご確認ください。',
    'stage.daily_limit_reached': '本日の挑戦回数の上限に達しました。進行状況はGameBullに保存されています。',
    'stage.stage_not_playable': 'このステージはまだプレイできません。TOPから参加し直してください。',
    'stage.all_cleared': '全1,000ステージ達成。特典はGameBullでご確認ください。',
    'stage.stage_required': 'ステージ番号の送信に問題があります。開発者へお問い合わせください。',
    'stage.play_token_required': '参加情報を確認できません。開発者へお問い合わせください。',
    'play.session_token_expired': '参加の有効期限が切れました。TOPから参加し直してください。',
    'play.session_token_invalid': 'GameBullへの接続に失敗しました。GameBullのゲーム画面から開き直してください。',
    'guest.session_invalid': 'GameBullへの接続に失敗しました。GameBullのゲーム画面から開き直してください。',
    'stage.score_not_accepted': 'クリア報告の設定に問題があります。開発者へお問い合わせください。',
    'play.mode_not_enabled': 'このゲームのステージモードをGameBull側で有効にしてください。'
  };
  const fail = (code, message) => new StageError(code, message || MESSAGES[code] || 'GameBullへの接続に失敗しました。');

  /* ── storage (sessionStorage, this tab only; the play token never goes into their storage) ── */
  const blank = () => ({ active: null, starts: {}, ended: [] });
  let store = blank();
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.starts && Array.isArray(s.ended)) store = Object.assign(blank(), s); } catch { /* private mode */ }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ } };

  /* ── server ── */
  let n = 0, ctx = null;
  async function request(path, { method = 'GET', body, bearer } = {}) {
    // 12 s, under their gamebull.js 15 s race, so an unknown answer is known HERE before their timeout message.
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 12000);
    const headers = { Accept: 'application/json' };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    if (body) headers['Content-Type'] = 'application/json';
    // GETs are cache-busted with a unique URL (a cached /context showed lives one play behind, playbook section 3).
    const url = api + path + (method === 'GET' ? (path.includes('?') ? '&' : '?') + '_ts=' + Date.now() + '-' + (++n) : '');
    let response, data;
    try {
      response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: abort.signal,
        cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    } catch { throw fail('network', '通信結果を確認できませんでした。接続を確認してください。'); }
    finally { clearTimeout(timeout); }
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      // Codes arrive nested ({error:{code}}) or top-level ({code}) (playbook section 3, error shapes).
      const code = (data && data.error && data.error.code) || (data && typeof data.code === 'string' && data.code) || 'http_' + response.status;
      const e = fail(code, MESSAGES[code] || (response.status >= 500 ? 'GameBullへの接続に失敗しました。時間をおいてお試しください。' : 'GameBullへの接続に失敗しました。'));
      e.httpStatus = response.status; throw e;
    }
    if (!data || typeof data !== 'object') throw fail('bad_response', 'GameBullからの応答を確認できませんでした。');
    return data;
  }

  async function refresh() {
    if (!api) throw fail('not_configured', 'GameBullの接続先が未設定です。開発者に接続設定を依頼してください。');
    if (!token || !tenant) throw fail('launch_required', 'GameBull接続待ちです。GameBullから起動してください。');
    const data = await request('/play/games/' + encodeURIComponent(ENV.gameId) + '/context?tenantSlug=' + encodeURIComponent(tenant), { bearer: token });
    const m = data.stageMode;
    // stageMode is sent only for a "Play Stage Mode" launch (boot token mode STAGE_CLEAR); "Game Start" gets null.
    if (!m) throw fail('stage_mode_required', 'このゲームはステージモードで遊べます。GameBullのゲーム画面の「Play Stage Mode」から開いてください。');
    const h = m.highestCleared;
    if (m.totalStages !== TOTAL) throw fail('bad_context', 'GameBullのステージ数が1,000ではありません（' + m.totalStages + '）。管理者に確認してください。');
    if (!Number.isInteger(h) || h < 0 || h > TOTAL || (h >= TOTAL ? m.nextStage !== null : m.nextStage !== h + 1) || !(m.maxAttemptSeconds > 0))
      throw fail('bad_context', 'ステージ情報がゲームと一致しません。管理者に確認してください。');
    const first = !ctx;
    ctx = data;
    if (first) log(`Build v${ENV.build}. /context has stageMode (cleared ${h}/${m.totalStages}, next ${m.nextStage}, ` +
      `${m.maxAttemptSeconds} s per attempt, daily limit ${m.dailyAttemptLimit ?? 'none'}), ${lives()} Lives.`);
    // An attempt for a stage the server already counts as cleared (cleared in another tab) is over.
    const a = store.active;
    if (a && !a.result && a.stage <= h && !a.clearBody) { log(`Stage ${a.stage} attempt dropped: the server has ${h} cleared.`); close(a, 'cleared elsewhere'); }
    return data;
  }
  const lives = () => { const c = ctx && ctx.lives && ctx.lives.count; return Number.isInteger(c) && c >= 0 ? c : 0; };

  /* ── attempts ── */
  function live(a) {
    if (!a || a.ended || a.result) return false;
    const exp = jwtPayload(a.token);
    return !!exp && exp.exp * 1000 > Date.now() && Date.now() < a.deadline;
  }
  function close(a, why) {
    if (!a) return;
    a.ended = true;
    if (!store.ended.includes(a.attemptId)) store.ended = store.ended.concat(a.attemptId).slice(-50);
    if (store.active === a) store.active = null;
    save(); log(`Attempt ${a.attemptId} closed (${why}).`);
  }

  // Their pour rule (game.js amount(): same colour on top, or an empty bottle; capacity 4; the whole top run that fits).
  function amount(a, b) {
    if (!a.length || b.length === 4 || (b.length && a[a.length - 1] !== b[b.length - 1])) return 0;
    let k = 1; while (k < a.length && a[a.length - 1 - k] === a[a.length - 1]) k++;
    return Math.min(k, 4 - b.length);
  }
  // Replays their move list ({from,to,units}, bottles from 1) on the stage's starting board; null if any move is illegal.
  function replay(stage, moves) {
    const level = typeof LEVELS !== 'undefined' && LEVELS[stage - 1];
    if (!level || !Array.isArray(moves)) return null;
    const b = level.bottles.map(x => x.slice());
    for (const m of moves) {
      const from = m && m.from - 1, to = m && m.to - 1;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || !b[from] || !b[to]) return null;
      const k = amount(b[from], b[to]);
      if (!k || k !== m.units) return null;
      const c = b[from][b[from].length - 1];
      b[from].splice(b[from].length - k, k);
      for (let i = 0; i < k; i++) b[to].push(c);
    }
    return b;
  }
  const solvedBoard = b => b.length > 0 && b.every(x => !x.length || (x.length === 4 && x.every(c => c === x[0])));

  const inflight = new Map();

  async function enterStage(req) {
    const key = req && req.idempotencyKey, stage = req && req.stage;
    if (typeof key !== 'string' || !key || !Number.isInteger(stage)) return { authorized: false, message: '参加情報を確認できません。' };
    if (inflight.has(key)) return inflight.get(key);
    const p = enter(key, stage).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function enter(key, stage) {
    try { await refresh(); }
    catch (e) { return { authorized: false, message: e.message }; }
    const m = ctx.stageMode;
    if (m.nextStage === null) return { authorized: false, message: MESSAGES['stage.all_cleared'] };
    if (stage !== m.nextStage) return { authorized: false, message: MESSAGES['stage.stage_not_playable'] };
    // Their rule 4: the same stage's running attempt is reused (same key, reload, TOP -> START), no second Life.
    const a = store.active;
    if (a && a.stage === stage && live(a)) {
      a.resumed = true; store.starts[key] = { attemptId: a.attemptId }; save();
      log(`Stage ${stage}: running attempt ${a.attemptId} reused (no Life), ${a.moves.length} moves saved.`);
      return { authorized: true, stage, attemptId: a.attemptId };
    }
    if (a) close(a, a.result ? 'finished' : 'expired');
    // A key whose earlier answer was lost (store.starts[key].lost) gets a new entry here: the player was told.
    let data;
    try { data = await request('/play/plays', { method: 'POST', body: { bootToken: token, stage } }); }
    catch (e) {
      if (e.code === 'network' || e.httpStatus >= 500) {
        // No idempotency key on this call: an unknown answer is never re-sent. The next START is a new entry.
        store.starts[key] = { lost: true }; save();
        try { await refresh(); } catch { /* keep the message below */ }
        const left = ctx ? '（残りライフ ' + lives() + '）' : '';
        log(`Stage ${stage} entry answer lost (${e.code}); not re-sent.`);
        return { authorized: false, message: '参加結果を確認できませんでした。ライフが使われた可能性があります' + left + '。もう一度STARTを押すと、新しい参加になります（ライフ1）。' };
      }
      if (e.code === 'play.no_lives') { try { await refresh(); } catch { /* shown below */ } }
      log(`Stage ${stage} entry refused: ${e.code}.`);
      return { authorized: false, message: e.message };
    }
    const sm = data.stageMode, deadline = Date.parse(sm && sm.deadlineAt), expires = Date.parse(data.expiresAt);
    if (typeof data.playToken !== 'string' || !data.playToken || data.mode !== 'STAGE_CLEAR' || !sm || sm.stage !== stage
      || !['PAID', 'FREE_REPLAY'].includes(sm.kind) || !Number.isFinite(deadline) || !(sm.maxAttemptSeconds > 0))
      return { authorized: false, message: '参加の開始情報を確認できませんでした。' };
    const startedAt = Date.now();
    const attempt = { attemptId: 'gb-' + data.playToken.slice(-12) + '-' + startedAt.toString(36), stage, token: data.playToken, kind: sm.kind,
      startedAt, limitSeconds: sm.maxAttemptSeconds,
      deadline: Math.min(deadline, Number.isFinite(expires) ? expires : Infinity, startedAt + sm.maxAttemptSeconds * 1000),
      moves: [], ended: false, resumed: false, clearBody: null, result: null };
    store.active = attempt; store.starts[key] = { attemptId: attempt.attemptId };
    const keys = Object.keys(store.starts); if (keys.length > 50) for (const k of keys.slice(0, keys.length - 50)) delete store.starts[k];
    save();
    log(`Stage ${stage} entered (${sm.kind}${sm.kind === 'PAID' ? ', 1 Life on the server' : ', free'}), limit ${sm.maxAttemptSeconds} s.`);
    try { await refresh(); } catch { /* the entry stands; lives refresh on the next call */ }
    return { authorized: true, stage, attemptId: attempt.attemptId };
  }

  async function completeStage(req) {
    const a = store.active;
    if (!a || !req || a.attemptId !== req.attemptId || a.stage !== req.stage) return { accepted: false, message: '参加情報を確認できません。' };
    if (!a.clearBody) {
      const board = replay(a.stage, req.moves);
      if (!board || !solvedBoard(board)) { log(`Stage ${a.stage}: move check FAILED (${(req.moves || []).length} moves); clear not reported.`); return { accepted: false, message: 'クリア手順を確認できませんでした。' }; }
      log(`Stage ${a.stage}: replay ok (${req.moves.length} moves, their pour rule).`);
      a.clearBody = { sessionToken: a.token, playTimeMs: Math.max(0, Date.now() - a.startedAt) };
      a.moves = req.moves.slice(); save();
    }
    if (!a.result) {
      let data;
      try { data = await request('/play/stage-clears', { method: 'POST', body: a.clearBody }); }
      catch (e) {
        // Safe resend: the same play token and playTimeMs (the server answers a repeat with its stored verdict).
        log(`Stage ${a.stage} clear not confirmed (${e.code}); their resend button sends the same report.`);
        if (e.code === 'play.session_token_expired' || e.code === 'stage.play_token_required') { close(a, 'token refused'); return { accepted: false, message: e.message }; }
        return { accepted: false, message: e.message + ' 「クリア確認を再送信」を押してください。' };
      }
      if (!['CLEARED', 'ALREADY_CLEARED', 'REPLAY', 'TIME_EXCEEDED'].includes(data.status) || data.stage !== a.stage)
        return { accepted: false, message: 'クリア判定を確認できませんでした。「クリア確認を再送信」を押してください。' };
      a.result = data; save();
      log(`Stage ${a.stage} clear: ${data.status} (${data.highestCleared}/${data.totalStages} cleared${data.reward ? ', reward ' + data.reward.status : ''}).`);
      try { await refresh(); } catch { /* the clear answer is authoritative */ }
      dispatchEvent(new CustomEvent('ponte-gb:clear', { detail: data }));
    }
    const d = a.result;
    if ((d.status === 'CLEARED' || d.status === 'ALREADY_CLEARED') && d.highestCleared === a.stage)
      return { accepted: true, completedStages: d.highestCleared, nextStage: d.nextStage, rewardStatus: d.reward ? d.reward.status : 'none' };
    if (store.active === a) close(a, d.status);
    if (d.status === 'TIME_EXCEEDED') return { accepted: false, message: '制限時間を過ぎたため、この参加はクリアになりませんでした。TOPから参加し直してください（ライフ1）。' };
    return { accepted: false, message: 'このステージは別の画面で進行済みです。TOPから続きに参加してください。' };
  }

  async function endStage(req) {
    const a = store.active, id = req && req.attemptId;
    if (a && a.attemptId === id && a.stage === req.stage) {
      if (a.clearBody) return { ended: false, message: 'クリア報告中の参加は終了できません。' };
      close(a, 'GAME OVER, ' + (req.reason || 'ended'));
      log(`Stage ${req.stage}: the next entry is a new attempt (1 Life on the server).`);
      return { ended: true };
    }
    if (store.ended.includes(id)) return { ended: true };
    return { ended: false, message: '参加情報を確認できません。' };
  }

  window.GameBullIntegration = {
    async getProgress() {
      await refresh();
      return { completedStages: ctx.stageMode.highestCleared };
    },
    enterStage, completeStage, endStage
  };

  // Read by gb/ponte-hooks.js (timer, board resume, reward card).
  window.PonteGB = {
    get active() { return store.active; },
    get context() { return ctx; },
    get lives() { return lives(); },
    embedded: window.parent !== window,
    remainingMs() { const a = store.active; return a ? Math.max(0, a.deadline - Date.now()) : 0; },
    saveMoves(trace) { const a = store.active; if (!a || a.ended || a.clearBody || !Array.isArray(trace)) return; if (a.moves.length === trace.length) return; a.moves = trace.map(m => ({ from: m.from, to: m.to, units: m.units })); save(); },
    takeResume() { const a = store.active; if (!a || !a.resumed) return null; a.resumed = false; save(); return a; },
    replay
  };
})();
