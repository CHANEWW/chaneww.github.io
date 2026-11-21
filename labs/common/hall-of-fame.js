/* ============================================================
   Science Virtual LAB — 게임 명예의 전당 (hall-of-fame.js)
   ------------------------------------------------------------
   🎮 게임 탭 11종이 함께 쓰는 공용 순위 모듈 (TOP 10)

   1) 게임 화면: 우측 상단 [🏆] 버튼 + 시작/결과 화면의 [🏆 명예의 전당] 버튼
   2) 게임이 끝나면 결과 카드에 닉네임 입력 + [🏆 기록 등록] 줄이 나타남
   3) 메인(index.html) 게임 탭: [🏆 명예의 전당] 카드 → 11개 게임 순위 모아보기

   ■ 연동 스위치
     아래 HALL_OF_FAME_WEBAPP_URL 이 비어 있으면 이 기기(localStorage) 기록으로
     동작하고 "구글 시트 연동 준비 중" 안내가 뜹니다.
     Apps Script 웹앱을 배포해 .../exec 주소를 여기에 붙여 넣는 순간
     전 기기 실시간 순위로 바뀝니다. (게임 파일은 다시 손댈 필요 없음)

   ■ 게임에서 쓰는 법 (2줄)
     <script>window.HOF_GAME = { game:'element_ninja', result:'#ovOver .card' };</script>
     <script src="../common/hall-of-fame.js" defer></script>
     ... 게임이 끝나는 곳에서:  if (window.HOF) HOF.gameOver(G.score, '벤 구체 ' + G.sliced + '개');
   ============================================================ */
(function () {
    'use strict';
    if (window.HOF) return;

    /* ==========================================================
       0. 설정 — 배포 후 여기에 웹 앱 URL을 붙여 넣으세요
       ========================================================== */
    /* 아래 한 줄만 바꾸면 됩니다(원하면 페이지에서 window.HALL_OF_FAME_WEBAPP_URL 로 덮어쓸 수도 있음). */
    var HALL_OF_FAME_WEBAPP_URL = (typeof window !== 'undefined' && window.HALL_OF_FAME_WEBAPP_URL) ||
        'https://script.google.com/macros/s/AKfycbzxKLLB2AVGXZvtDAPmn-DQ3npb7wpVSBAVLS-WUTZBBXbbF-vDztdzWSngbR_l28HacA/exec';

    var LS_KEY = 'svl_hof_v1_';
    var LS_NICK = 'svl_hof_nick';
    var MAX_LOCAL = 50;
    var TIMEOUT = 12000;

    /* 게임 ID = Apps Script GAMES 키. tab 은 시트 탭 이름(참고용) */
    var GAMES = {
        element_ninja: { name: '원소 닌자', icon: '🔪', unit: '점', tab: '원소 닌자' },
        air_bounce: { name: '에어 튕기기', icon: '🏐', unit: '점', tab: '에어 튕기기' },
        finger_shooting: { name: '핑거 슈팅', icon: '🎯', unit: '점', tab: '핑거 슈팅' },
        red_light_green_light: { name: '무궁화 꽃이 피었습니다', icon: '🌺', unit: '%', tab: '무궁화 꽃이 피었습니다' },
        silhouette_pose: { name: '실루엣 포즈 맞추기', icon: '🧍', unit: '개', tab: '실루엣 포즈 맞추기' },
        school_challenge: { name: '학교생활 챌린지', icon: '🏫', unit: '점', tab: '학교생활 챌린지' },
        ox_speed_quiz: { name: '과학 오개념 OX 스피드 퀴즈', icon: '⏱️', unit: '점', tab: '과학 오개념 OX 스피드 퀴즈' },
        digital_escape_room: { name: '디지털 과학 방탈출', icon: '🔐', unit: '초', tab: '디지털 과학 방탈출' },
        festival_booth: { name: '과학 축제 부스', icon: '🎪', unit: '점', tab: '과학 축제 부스' },
        electron_runner: { name: '내가 전자다', icon: '⚡', unit: '점', tab: '내가 전자다' },
        fact_check: { name: '생활 속 과학 팩트체크', icon: '🔬', unit: '점', tab: '생활 속 과학 팩트체크' }
    };
    var ORDER = ['element_ninja', 'air_bounce', 'finger_shooting', 'red_light_green_light',
        'silhouette_pose', 'school_challenge', 'ox_speed_quiz', 'digital_escape_room', 'festival_booth',
        'electron_runner', 'fact_check'];

    /* 게임별 한 줄 설명 — 모달 위쪽 안내에 표시 */
    var HINT = {
        element_ninja: '60초 안에 벤 원소 구체 점수',
        air_bounce: '공을 튕겨 올린 점수',
        finger_shooting: '분자 표적을 맞힌 점수',
        red_light_green_light: '결승선까지 간 비율(높을수록 좋아요)',
        silhouette_pose: '통과한 벽 수',
        school_challenge: '1분 동안 모은 학교생활 점수',
        ox_speed_quiz: '정답률(높을수록 좋아요)',
        digital_escape_room: '탈출 성공 시 남은 시간(클수록 좋아요)',
        festival_booth: '다섯 미니게임 합계 점수',
        electron_runner: '전구까지 도달한 진행도(높을수록 좋아요)',
        fact_check: '속도·콤보 보너스까지 더한 점수(높을수록 좋아요)'
    };

    function isLive() {
        return /^https?:\/\//.test(HALL_OF_FAME_WEBAPP_URL || '');
    }

    /* ==========================================================
       1. 공통 유틸
       ========================================================== */
    function $(sel, root) { return (root || document).querySelector(sel); }
    function el(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html !== undefined) n.innerHTML = html;
        return n;
    }
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function num(v) {
        var n = Number(v);
        if (!isFinite(n)) return 0;
        return Math.round(n * 10) / 10;
    }
    function fmt(score, unit) {
        var n = num(score);
        var s = (n % 1 === 0) ? String(n) : n.toFixed(1);
        return s + (unit || '');
    }
    function nowStamp() {
        var d = new Date();
        var p = function (v) { return (v < 10 ? '0' : '') + v; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function toast(msg, ms) {
        if (window.SVL && window.SVL.toast) { window.SVL.toast(msg, ms); return; }
        var t = document.getElementById('hof-toast');
        if (!t) { t = el('div', 'hof-toast'); t.id = 'hof-toast'; document.body.appendChild(t); }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._t);
        t._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2400);
    }
    function nick() {
        try { return localStorage.getItem(LS_NICK) || ''; } catch (e) { return ''; }
    }
    function saveNick(v) {
        try { localStorage.setItem(LS_NICK, v); } catch (e) { }
    }

    /* ==========================================================
       2. 이 기기 기록 (localStorage 폴백)
       ========================================================== */
    function localList(game) {
        try {
            var raw = localStorage.getItem(LS_KEY + game);
            var list = raw ? JSON.parse(raw) : [];
            return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
        } catch (e) { return []; }
    }
    function localSave(game, list) {
        try { localStorage.setItem(LS_KEY + game, JSON.stringify(list.slice(0, MAX_LOCAL))); } catch (e) { }
    }
    function sortRows(rows) {
        rows.sort(function (a, b) {
            if (num(b.score) !== num(a.score)) return num(b.score) - num(a.score);
            return String(a.at || '').localeCompare(String(b.at || ''));
        });
        return rows;
    }
    function localTop(game, n) {
        var rows = sortRows(localList(game).slice()).slice(0, n || 10);
        return rows.map(function (r, i) {
            return { rank: i + 1, nick: r.nick, score: num(r.score), note: r.note || '', at: r.at || '' };
        });
    }
    function localAdd(game, rec) {
        var list = localList(game);
        list.push({ nick: rec.nick, score: num(rec.score), note: rec.note || '', at: nowStamp(), ts: Date.now() });
        list = sortRows(list);
        localSave(game, list);
        return localTop(game, 10);
    }

    /* ==========================================================
       3. 구글 시트(웹앱) 통신 — JSONP 읽기 / POST+JSONP 쓰기
       ========================================================== */
    var seq = 0;
    function jsonp(url, cb) {
        var name = '__hofcb' + (++seq) + '_' + (Date.now() % 100000);
        var s = document.createElement('script');
        var done = false;
        var timer = null;
        function cleanup() {
            if (s.parentNode) s.parentNode.removeChild(s);
            try { delete window[name]; } catch (e) { window[name] = undefined; }
            if (timer) clearTimeout(timer);
        }
        window[name] = function (data) {
            if (done) return;
            done = true; cleanup(); cb(null, data);
        };
        timer = setTimeout(function () {
            if (done) return;
            done = true; cleanup(); cb(new Error('timeout'));
        }, TIMEOUT);
        s.onerror = function () {
            if (done) return;
            done = true; cleanup(); cb(new Error('network'));
        };
        s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + name + '&_=' + Date.now();
        document.body.appendChild(s);
    }

    function getTop(game, cb) {
        if (!isLive()) { cb(null, localTop(game, 10), 'local'); return; }
        jsonp(HALL_OF_FAME_WEBAPP_URL + '?game=' + encodeURIComponent(game), function (err, data) {
            if (err || !data || !data.ok || !data.top) {
                cb(err || new Error('bad_response'), localTop(game, 10), 'fallback');
                return;
            }
            cb(null, data.top, 'live');
        });
    }

    function getAll(cb) {
        if (!isLive()) {
            var out = {};
            ORDER.forEach(function (id) { out[id] = localTop(id, 10); });
            cb(null, out, 'local');
            return;
        }
        jsonp(HALL_OF_FAME_WEBAPP_URL + '?game=all', function (err, data) {
            if (err || !data || !data.ok || !data.all) {
                var fallback = {};
                ORDER.forEach(function (id) { fallback[id] = localTop(id, 10); });
                cb(err || new Error('bad_response'), fallback, 'fallback');
                return;
            }
            cb(null, data.all, 'live');
        });
    }

    /* POST는 본문을 text/plain 으로 보내 프리플라이트를 피한다.
       막히는 환경이면 JSONP(GET) 등록으로 한 번 더 시도한다. */
    function postRecord(game, nickname, score, note, cb) {
        if (!isLive()) { cb(null, { ok: true, saved: true, top: localAdd(game, { nick: nickname, score: score, note: note }) }, 'local'); return; }
        var payload = { action: 'register', game: game, nickname: nickname, score: score, note: note || '' };
        var viaJsonp = function () {
            var q = HALL_OF_FAME_WEBAPP_URL + '?action=register'
                + '&game=' + encodeURIComponent(game)
                + '&nickname=' + encodeURIComponent(nickname)
                + '&score=' + encodeURIComponent(score)
                + '&note=' + encodeURIComponent(note || '');
            jsonp(q, function (err, data) {
                if (err || !data || !data.ok) cb(err || new Error('register_failed'), data || null, 'jsonp');
                else cb(null, data, 'jsonp');
            });
        };
        if (typeof fetch !== 'function') { viaJsonp(); return; }
        var ctl = null;
        try { ctl = new AbortController(); } catch (e) { ctl = null; }
        var timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) { } }, TIMEOUT);
        fetch(HALL_OF_FAME_WEBAPP_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            signal: ctl ? ctl.signal : undefined
        }).then(function (r) {
            return r.text();
        }).then(function (txt) {
            clearTimeout(timer);
            var data = null;
            try { data = JSON.parse(txt); } catch (e) { data = null; }
            if (data && data.ok) cb(null, data, 'post');
            else viaJsonp();
        }).catch(function () {
            clearTimeout(timer);
            viaJsonp();
        });
    }

    /* ==========================================================
       4. 스타일 (한 번만 주입)
       ========================================================== */
    function injectCss() {
        if (document.getElementById('hof-css')) return;
        var css = [
            '.hof-pill{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border-radius:50%;',
            'border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;font-size:17px;line-height:1;cursor:pointer;',
            'box-shadow:0 6px 16px rgba(15,23,42,.10);font-family:inherit;flex:0 0 auto;transition:transform .15s}',
            '.hof-pill:hover{transform:translateY(-1px)}.hof-pill:active{transform:scale(.95)}',
            'body.dark-mode .hof-pill{background:#101a28;color:#e2e8f0;border-color:rgba(255,255,255,.18)}',
            '.hof-mask{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;',
            'background:rgba(4,8,16,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
            '.hof-modal{width:min(520px,94vw);max-height:86vh;overflow:auto;-webkit-overflow-scrolling:touch;border-radius:22px;',
            'background:#fff;color:#0f172a;border:1px solid rgba(15,23,42,.10);box-shadow:0 26px 70px rgba(2,6,23,.35);padding:18px 18px 14px;',
            'font-family:inherit;text-align:left}',
            'body.dark-mode .hof-modal{background:#0d1521;color:#e8eef6;border-color:rgba(255,255,255,.12)}',
            '.hof-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
            '.hof-title{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:900;letter-spacing:-.4px}',
            '.hof-title .hof-crown{font-size:21px;line-height:1}',
            '.hof-sub{display:block;font-size:11.5px;font-weight:700;color:#64748b;margin-top:2px}',
            'body.dark-mode .hof-sub{color:#94a3b8}',
            '.hof-x{width:34px;height:34px;border-radius:50%;border:1px solid rgba(15,23,42,.12);background:transparent;',
            'color:inherit;font-size:14px;cursor:pointer;flex:0 0 auto;font-family:inherit}',
            'body.dark-mode .hof-x{border-color:rgba(255,255,255,.18)}',
            '.hof-badge{display:inline-flex;align-items:center;gap:6px;margin:12px 0 4px;padding:6px 10px;border-radius:999px;',
            'font-size:11px;font-weight:800;background:#eef6ff;color:#0369a1;border:1px solid #bae6fd}',
            'body.dark-mode .hof-badge{background:rgba(56,189,248,.12);color:#7dd3fc;border-color:rgba(56,189,248,.28)}',
            '.hof-badge.off{background:#fff7ed;color:#b45309;border-color:#fed7aa}',
            'body.dark-mode .hof-badge.off{background:rgba(251,191,36,.12);color:#fcd34d;border-color:rgba(251,191,36,.3)}',
            '.hof-hint{font-size:11.5px;font-weight:700;color:#64748b;margin:2px 0 10px;line-height:1.5}',
            'body.dark-mode .hof-hint{color:#94a3b8}',
            '.hof-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}',
            '.hof-chip{padding:7px 11px;border-radius:999px;border:1px solid rgba(15,23,42,.12);background:transparent;color:inherit;',
            'font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap}',
            '.hof-chip.on{background:#0a84ff;border-color:#0a84ff;color:#fff}',
            'body.dark-mode .hof-chip{border-color:rgba(255,255,255,.18)}',
            '.hof-list{display:flex;flex-direction:column;gap:6px}',
            '.hof-row{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:9px;padding:9px 11px;border-radius:13px;',
            'background:#f5f8fc}',
            'body.dark-mode .hof-row{background:rgba(255,255,255,.05)}',
            '.hof-row.top1{background:linear-gradient(135deg,#fff7d6,#ffe9a8)}',
            '.hof-row.top2{background:linear-gradient(135deg,#f4f6f9,#e2e8f0)}',
            '.hof-row.top3{background:linear-gradient(135deg,#fdf0e4,#f8ddc4)}',
            'body.dark-mode .hof-row.top1{background:linear-gradient(135deg,rgba(255,215,64,.22),rgba(255,183,0,.14))}',
            'body.dark-mode .hof-row.top2{background:linear-gradient(135deg,rgba(203,213,225,.16),rgba(148,163,184,.1))}',
            'body.dark-mode .hof-row.top3{background:linear-gradient(135deg,rgba(251,191,110,.18),rgba(217,119,6,.12))}',
            '.hof-row.me{outline:2px solid #0a84ff;outline-offset:-2px}',
            '.hof-rk{font-size:13px;font-weight:900;text-align:center;color:#334155}',
            'body.dark-mode .hof-rk{color:#cbd5e1}',
            '.hof-nick{font-size:13px;font-weight:900;line-height:1.25;word-break:break-all}',
            '.hof-note{font-size:10.5px;font-weight:700;color:#64748b;margin-top:1px}',
            'body.dark-mode .hof-note{color:#94a3b8}',
            '.hof-score{font-size:14px;font-weight:900;color:#0369a1;font-variant-numeric:tabular-nums;white-space:nowrap}',
            'body.dark-mode .hof-score{color:#7dd3fc}',
            '.hof-empty{padding:22px 12px;text-align:center;font-size:12.5px;font-weight:700;color:#64748b;line-height:1.6}',
            'body.dark-mode .hof-empty{color:#94a3b8}',
            '.hof-foot{display:flex;gap:8px;margin-top:12px}',
            '.hof-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:10px 14px;',
            'border-radius:13px;border:1px solid rgba(15,23,42,.12);background:transparent;color:inherit;font-family:inherit;',
            'font-size:12.5px;font-weight:900;cursor:pointer}',
            'body.dark-mode .hof-btn{border-color:rgba(255,255,255,.18)}',
            '.hof-btn.primary{border:none;background:linear-gradient(135deg,#0a84ff,#0060df);color:#fff;box-shadow:0 8px 20px rgba(10,132,255,.3)}',
            '.hof-btn.primary:active{transform:scale(.985)}',
            '.hof-btn[disabled]{opacity:.55;cursor:default}',
            /* 결과 카드 안 등록 줄 */
            '.hof-reg{margin-top:14px;padding-top:12px;border-top:1px dashed rgba(148,163,184,.45);text-align:left}',
            '.hof-reg-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:900;margin-bottom:8px}',
            '.hof-reg-top b{font-size:14px;color:#0369a1}',
            'body.dark-mode .hof-reg-top b{color:#7dd3fc}',
            '.hof-reg-row{display:flex;gap:7px}',
            '.hof-input{flex:1;min-width:0;height:42px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.5);',
            'background:#fff;color:inherit;font-family:inherit;font-size:13px;font-weight:800}',
            'body.dark-mode .hof-input{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2)}',
            '.hof-input::placeholder{font-weight:700;color:#94a3b8}',
            '.hof-input[disabled]{opacity:.7}',
            '.hof-sub-btn{flex:0 0 auto;height:42px;padding:0 15px;border-radius:12px;border:none;background:linear-gradient(135deg,#0a84ff,#0060df);',
            'color:#fff;font-family:inherit;font-size:12.5px;font-weight:900;cursor:pointer;white-space:nowrap}',
            '.hof-sub-btn[disabled]{opacity:.6;cursor:default}',
            '.hof-msg{font-size:11.5px;font-weight:800;margin-top:7px;line-height:1.45;color:#0369a1;min-height:15px}',
            '.hof-msg.err{color:#dc2626}',
            '.hof-more{margin-top:8px;width:100%;height:36px;border-radius:11px;border:1px dashed rgba(148,163,184,.55);background:transparent;',
            'color:inherit;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer}',
            '.hof-toast{position:fixed;left:50%;bottom:96px;transform:translate(-50%,10px);z-index:9600;padding:11px 16px;border-radius:14px;',
            'background:rgba(15,23,42,.92);color:#fff;font-size:12.5px;font-weight:800;opacity:0;pointer-events:none;transition:.25s;',
            'font-family:inherit;max-width:86vw;text-align:center}',
            '.hof-toast.show{opacity:1;transform:translate(-50%,0)}',
            '.hof-card{cursor:pointer;text-align:left;width:100%;font-family:inherit}',
            '@media (max-width:430px){.hof-modal{padding:15px 14px 12px;border-radius:20px}.hof-row{grid-template-columns:30px 1fr auto;gap:7px;padding:8px 9px}',
            '.hof-pill{width:36px;height:36px;font-size:15px}.hof-chip{font-size:11px;padding:6px 9px}}'
        ].join('');
        var st = el('style');
        st.id = 'hof-css';
        st.appendChild(document.createTextNode(css));
        document.head.appendChild(st);
    }

    /* ==========================================================
       5. 순위 목록 렌더링
       ========================================================== */
    function rowsHtml(rows, game, hi) {
        if (!rows || !rows.length) {
            return '<div class="hof-empty">아직 기록이 없습니다.<br>첫 번째 기록의 주인공이 되어 보세요! 🏆</div>';
        }
        var unit = (GAMES[game] || {}).unit || '';
        return rows.map(function (r, i) {
            var rank = i + 1;
            var medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
            var cls = 'hof-row' + (rank <= 3 ? ' top' + rank : '');
            if (hi && hi.nick && r.nick === hi.nick && num(r.score) === num(hi.score)) cls += ' me';
            return '<div class="' + cls + '">' +
                '<div class="hof-rk">' + medal + '</div>' +
                '<div><div class="hof-nick">' + esc(r.nick || '손님') + '</div>' +
                (r.note ? '<div class="hof-note">' + esc(r.note) + '</div>' : '') + '</div>' +
                '<div class="hof-score">' + esc(fmt(r.score, unit)) + '</div>' +
                '</div>';
        }).join('');
    }

    function modeBadge(source) {
        if (source === 'live') return '<span class="hof-badge">🟢 실시간 · 구글 시트 연결됨</span>';
        if (source === 'fallback') return '<span class="hof-badge off">⚠️ 구글 시트에 연결하지 못해 이 기기 기록을 보여 줘요</span>';
        return '<span class="hof-badge off">📱 이 기기 기록 · 구글 시트 연동 준비 중</span>';
    }

    /* ==========================================================
       6. 모달 (게임별 / 모아보기)
       ========================================================== */
    var maskEl = null, modalGame = null, hubMode = false;

    function closeModal() {
        if (!maskEl) return;
        var m = maskEl;
        maskEl = null; modalGame = null; hubMode = false;
        document.removeEventListener('keydown', onEsc);
        m.parentNode && m.parentNode.removeChild(m);
    }
    function onEsc(e) { if (e.key === 'Escape' || e.key === 'Esc') closeModal(); }

    function ensureMask() {
        if (maskEl) return maskEl;
        injectCss();
        maskEl = el('div', 'hof-mask');
        maskEl.setAttribute('role', 'dialog');
        maskEl.setAttribute('aria-modal', 'true');
        maskEl.addEventListener('click', function (e) { if (e.target === maskEl) closeModal(); });
        document.body.appendChild(maskEl);
        document.addEventListener('keydown', onEsc);
        return maskEl;
    }

    function modalFrame(title, sub) {
        var mask = ensureMask();
        mask.innerHTML = '';
        var modal = el('div', 'hof-modal');
        modal.innerHTML =
            '<div class="hof-head">' +
            '<div><div class="hof-title"><span class="hof-crown">🏆</span><span>' + esc(title) + '</span></div>' +
            '<span class="hof-sub">' + esc(sub || '') + '</span></div>' +
            '<button type="button" class="hof-x" aria-label="닫기">✕</button>' +
            '</div><div class="hof-body"></div>';
        modal.querySelector('.hof-x').addEventListener('click', closeModal);
        mask.appendChild(modal);
        return modal;
    }

    function openGame(gameId) {
        var id = GAMES[gameId] ? gameId : modalGame || ORDER[0];
        injectCss();
        var modal = modalFrame(GAMES[id].icon + ' ' + GAMES[id].name + ' 명예의 전당', 'TOP 10');
        var body = modal.querySelector('.hof-body');
        body.innerHTML = '<div class="hof-badge">불러오는 중…</div><div class="hof-list"></div>';
        modalGame = id; hubMode = false;

        getTop(id, function (err, rows, source) {
            if (!maskEl || modalGame !== id || hubMode) return;
            body.innerHTML = modeBadge(source) +
                '<p class="hof-hint">' + esc(HINT[id] || '점수가 높은 순서') + '</p>' +
                '<div class="hof-list">' + rowsHtml(rows, id, lastOwn) + '</div>' +
                '<div class="hof-foot"><button type="button" class="hof-btn primary hof-go">🎮 게임하러 가기</button></div>';
            var go = body.querySelector('.hof-go');
            if (go) {
                var link = gameLink(id);
                if (!link) {
                    go.textContent = '닫기';
                    go.addEventListener('click', closeModal);
                } else {
                    go.addEventListener('click', function () { location.href = link; });
                }
            }
        });
    }

    function openHub() {
        injectCss();
        var modal = modalFrame('게임 명예의 전당', '게임을 고르면 TOP 10을 보여 줘요');
        var body = modal.querySelector('.hof-body');
        hubMode = true; modalGame = null;
        var chips = '<div class="hof-chips">' + ORDER.map(function (g) {
            return '<button type="button" class="hof-chip" data-g="' + g + '">' + GAMES[g].icon + ' ' + esc(GAMES[g].name) + '</button>';
        }).join('') + '</div>';
        body.innerHTML = '<div class="hof-badge">불러오는 중…</div>' + chips + '<div class="hof-list"></div>';
        var listBox = body.querySelector('.hof-list');
        var chipBox = body.querySelector('.hof-chips');

        getAll(function (err, map, source) {
            if (!maskEl || !hubMode) return;
            var badge = body.querySelector('.hof-badge');
            if (badge) badge.outerHTML = modeBadge(source);
            var show = function (g) {
                var chips = chipBox.querySelectorAll('.hof-chip');
                for (var i = 0; i < chips.length; i++) {
                    chips[i].classList.toggle('on', chips[i].getAttribute('data-g') === g);
                }
                listBox.innerHTML = '<p class="hof-hint">' + esc(GAMES[g].name + ' · ' + (HINT[g] || '')) + '</p>' +
                    rowsHtml(map[g] || [], g, lastOwn);
            };
            chipBox.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('.hof-chip') : null;
                if (b) show(b.getAttribute('data-g'));
            });
            show(ORDER[0]);
        });
    }

    /* 게임이 자기 파일로 가는 경로 — 사이트 안에서 상대 경로로 이동 */
    var LINKS = {
        element_ninja: 'game/element_ninja.html',
        air_bounce: 'game/air_bounce.html',
        finger_shooting: 'game/finger_shooting.html',
        red_light_green_light: 'game/red_light_green_light.html',
        silhouette_pose: 'game/silhouette_pose.html',
        school_challenge: 'game/game.html',
        ox_speed_quiz: 'game/ox_speed_quiz.html',
        digital_escape_room: 'game/digital_escape_room.html',
        festival_booth: 'game/festival_booth_kiosk.html',
        electron_runner: 'game/electron_runner.html',
        fact_check: 'game/fact_check.html'
    };
    var PREFIX = (function () {
        /* hall-of-fame.js 는 labs/common/ 에 있으므로 사이트 뿌리는 ../../ */
        var s = document.currentScript || (function () {
            var all = document.getElementsByTagName('script');
            for (var i = all.length - 1; i >= 0; i--) if (/hall-of-fame\.js/.test(all[i].src)) return all[i];
            return null;
        })();
        var base = s && s.src ? s.src.replace(/labs\/common\/hall-of-fame\.js.*$/, '') : '';
        return /^https?:/.test(base) ? base : '';
    })();
    function gameLink(id) {
        var isGamePage = /\/(labs|class|game)\//.test(location.pathname);
        if (isGamePage) return null;              /* 게임 안에서는 이동 버튼을 숨긴다 */
        return (PREFIX || '') + (LINKS[id] || '');
    }

    /* ==========================================================
       7. 게임 종료 → 닉네임 입력 + 기록 등록
       ========================================================== */
    var cfg = { game: null, result: null, mounted: false };
    var lastOwn = null;
    var regBox = null, regScoreEl = null, regInput = null, regBtn = null, regMsg = null, regGame = null, regValue = 0, regNote = '';

    function ensureRegBox(host) {
        if (regBox && regBox.parentNode === host) return regBox;
        injectCss();
        regBox = el('div', 'hof-reg');
        regBox.innerHTML =
            '<div class="hof-reg-top"><span>🏆 명예의 전당</span><b class="hof-reg-score">0</b></div>' +
            '<div class="hof-reg-row">' +
            '<input class="hof-input" type="text" maxlength="12" autocomplete="off" spellcheck="false" placeholder="닉네임(별명)을 적어 주세요" aria-label="닉네임">' +
            '<button type="button" class="hof-sub-btn">기록 등록</button>' +
            '</div>' +
            '<div class="hof-msg"></div>' +
            '<button type="button" class="hof-more">🏆 명예의 전당 TOP 10 보기</button>';
        host.appendChild(regBox);
        regScoreEl = regBox.querySelector('.hof-reg-score');
        regInput = regBox.querySelector('.hof-input');
        regBtn = regBox.querySelector('.hof-sub-btn');
        regMsg = regBox.querySelector('.hof-msg');
        regBox.querySelector('.hof-more').addEventListener('click', function () { openGame(regGame); });

        regBtn.addEventListener('click', doRegister);
        regInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); doRegister(); }
        });
        return regBox;
    }

    function doRegister() {
        var name = (regInput.value || '').replace(/\s+/g, ' ').trim().slice(0, 12);
        if (!name) {
            regMsg.className = 'hof-msg err';
            regMsg.textContent = '닉네임(별명)을 1~12글자로 적어 주세요.';
            regInput.focus();
            return;
        }
        saveNick(name);
        regBtn.disabled = true;
        regMsg.className = 'hof-msg';
        regMsg.textContent = '등록하는 중…';
        postRecord(regGame, name, regValue, regNote, function (err, data, via) {
            regBtn.disabled = false;
            if (err || !data || !data.ok) {
                regMsg.className = 'hof-msg err';
                var msg = (data && data.message) ? data.message : '지금은 기록을 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.';
                regMsg.textContent = msg;
                return;
            }
            lastOwn = { nick: name, score: regValue };
            /* 한 판에 한 번만 등록되도록 잠급니다(새 게임이 끝나면 다시 풀림) */
            regBtn.disabled = true;
            regInput.disabled = true;
            regBtn.textContent = '등록 완료';
            var rank = 0;
            (data.top || []).forEach(function (r) { if (r.nick === name && num(r.score) === num(regValue)) rank = rank || r.rank; });
            regMsg.className = 'hof-msg';
            regMsg.textContent = rank
                ? '🎉 ' + name + ' 님 ' + rank + '위로 등록! (전체 ' + (data.total || (data.top || []).length) + '건)'
                : '✅ 등록했어요. (전체 ' + (data.total || (data.top || []).length) + '건)';
            /* 등록 직후 순위판을 바로 보여 준다 */
            if (data.duplicated) {
                toast('이미 등록된 기록이에요', 2200);
            }
            openGameFromData(regGame, data.top || [], via === 'local' ? 'local' : 'live');
        });
    }

    /* 등록 응답의 목록을 그대로 그려 서버를 한 번 더 부르지 않는다 */
    function openGameFromData(gameId, rows, source) {
        injectCss();
        var id = GAMES[gameId] ? gameId : ORDER[0];
        var modal = modalFrame(GAMES[id].icon + ' ' + GAMES[id].name + ' 명예의 전당', 'TOP 10');
        var body = modal.querySelector('.hof-body');
        body.innerHTML = modeBadge(source) +
            '<p class="hof-hint">' + esc(HINT[id] || '') + '</p>' +
            '<div class="hof-list">' + rowsHtml(rows, id, lastOwn) + '</div>' +
            '<div class="hof-foot"><button type="button" class="hof-btn hof-again">다시 도전하기</button>' +
            '<button type="button" class="hof-btn primary hof-close2">닫기</button></div>';
        modalGame = id; hubMode = false;
        body.querySelector('.hof-close2').addEventListener('click', closeModal);
        body.querySelector('.hof-again').addEventListener('click', function () {
            closeModal();
            var b = document.getElementById('btnAgain');
            if (b) { b.click(); return; }
            var again = document.querySelector('[data-hof-again]') || null;
            if (again) { again.click(); return; }
        });
    }

    /* ==========================================================
       8. 우측 상단 [🏆] 버튼
       ========================================================== */
    /* 제목(⬅ 메인) 줄과 겹치면 스스로 숨긴다 — 찬우님 UI 원칙: 인터페이스끼리 겹치지 않기 */
    function pillFits() {
        var p = document.getElementById('hof-pill');
        if (!p || !p.parentNode) return false;
        var tl = document.querySelector('.top-left-bar') || document.querySelector('.back-btn');
        /* 버튼 하나만이 아니라 [💡 제안하기][🏆][🌙] 줄 전체가 제목과 겹치는지 본다 */
        var row = p.parentNode;
        var a = (row && row.getBoundingClientRect) ? row.getBoundingClientRect() : p.getBoundingClientRect();
        if (!a.width || !tl) return true;
        var b = tl.getBoundingClientRect();
        if (!b.width) return true;
        var vertical = !(b.bottom <= a.top || a.bottom <= b.top);
        return !(vertical && b.right + 4 > a.left);
    }
    function syncPill() {
        var p = document.getElementById('hof-pill');
        if (!p) return;
        p.style.display = '';                 /* 측정할 때는 보이게 */
        p.style.display = pillFits() ? '' : 'none';
    }

    function mountPill() {
        if (document.getElementById('hof-pill')) return;
        var bar = document.querySelector('.top-right-bar');
        if (!bar) return;                      /* 상단 바가 없는 화면은 시작·결과 화면 버튼으로만 */

        var btn = el('button', 'hof-pill');
        btn.id = 'hof-pill';
        btn.type = 'button';
        btn.title = '명예의 전당';
        btn.setAttribute('aria-label', '명예의 전당');
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.innerHTML = '🏆';
        btn.addEventListener('click', function () {
            if (cfg.game) openGame(cfg.game);
            else openHub();
        });

        var row = bar.querySelector('.tr-util');
        if (!row) {
            row = el('div', 'tr-util');
            bar.insertBefore(row, bar.firstChild);
        }
        var theme = document.getElementById('theme-toggle');
        if (theme && theme.parentElement === row) row.insertBefore(btn, theme);
        else row.appendChild(btn);

        syncPill();
        window.addEventListener('resize', syncPill);
        window.addEventListener('orientationchange', function () { setTimeout(syncPill, 220); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncPill).catch(function () { });
    }

    /* 상단 바가 없는 화면(예: 과학 축제 부스 랭킹)에는 글자 버튼을 직접 끼워 넣는다 */
    function mountLink(sel) {
        var host = document.querySelector(sel);
        if (!host || host.querySelector('[data-hof-link]')) return;
        var b = el('button', host.classList.contains('rank-foot') ? 'mini-btn' : 'hof-btn', '🌐 전 기기 명예의 전당');
        b.type = 'button';
        b.setAttribute('data-hof-link', '1');
        b.addEventListener('click', function () { openGame(cfg.game); });
        host.appendChild(b);
    }

    /* ==========================================================
       9. 공개 API
       ========================================================== */
    function init(opts) {
        opts = opts || {};
        injectCss();
        if (opts.game && GAMES[opts.game]) cfg.game = opts.game;
        cfg.result = opts.result || null;
        if (opts.pill !== false) mountPill();
        if (opts.mountTo) mountLink(opts.mountTo);
        if (opts.start) {
            /* 시작 화면에 [🏆 명예의 전당] 버튼을 붙인다 */
            var host = document.querySelector(opts.start);
            if (host && !host.querySelector('[data-hof-open]')) {
                var b = el('button', 'hof-btn hof-open-btn', '🏆 명예의 전당');
                b.type = 'button';
                b.setAttribute('data-hof-open', '1');
                b.style.marginTop = '8px';
                b.addEventListener('click', function () { openGame(cfg.game); });
                host.appendChild(b);
            }
        }
        return HOF;
    }

    /**
     * 게임이 끝났을 때 호출.
     * @param {number} score  기록 점수 (클수록 좋은 기록으로 정렬)
     * @param {string} note   비고(선택: '결승 통과 · 32초', '오답 2회' 등)
     * @param {string} host   결과 카드 선택자(선택). 없으면 자동 탐색
     * @param {string} before  등록 줄을 이 요소 앞에 넣기(선택, 예: '.result-actions')
     */
    function gameOver(score, note, host, before) {
        if (!cfg.game) return;
        var sel = host || cfg.result;
        var box = null;
        if (sel) box = document.querySelector(sel);
        if (!box) {
            var auto = ['#ovOver .card', '#result .card', '.screen.result .card', '.end-card', '.overlay.show .card'];
            for (var i = 0; i < auto.length; i++) {
                var cand = document.querySelector(auto[i]);
                if (cand) { box = cand; break; }
            }
        }
        if (!box) return;
        ensureRegBox(box);
        if (before) {
            var anchor = box.querySelector(before);
            if (anchor && anchor.parentNode === box && regBox.nextSibling !== anchor) box.insertBefore(regBox, anchor);
        }
        regGame = cfg.game;
        regValue = num(score);
        regNote = note || '';
        regScoreEl.textContent = fmt(regValue, (GAMES[cfg.game] || {}).unit || '');
        regMsg.className = 'hof-msg';
        regMsg.textContent = '';
        regBtn.disabled = false;
        regInput.disabled = false;
        regBtn.textContent = '기록 등록';
        if (!regInput.value) regInput.value = nick();
        regInput.setAttribute('placeholder', '닉네임(별명)을 적어 주세요');
        /* 결과 카드가 열린 뒤에도 화면 안에 보이도록 살짝 스크롤 */
        try {
            setTimeout(function () {
                if (regBox && regBox.parentNode) regBox.scrollIntoView({ block: 'nearest' });
            }, 260);
        } catch (e) { }
    }

    var HOF = {
        version: '1.0.0',
        games: GAMES,
        order: ORDER,
        isLive: isLive,
        init: init,
        gameOver: gameOver,
        open: openGame,
        hub: openHub,
        close: closeModal,
        localTop: localTop,
        /** 자기 화면의 기록 UI가 따로 있는 게임(과학 축제 부스)이 시트로 바로 보낼 때 */
        submit: function (nickname, score, note, cb) {
            if (!cfg.game) return;
            postRecord(cfg.game, String(nickname || '').trim().slice(0, 12), num(score), note || '', function (err, data, via) {
                if (!err && data && data.ok) lastOwn = { nick: nickname, score: num(score) };
                if (typeof cb === 'function') cb(err, data, via);
            });
        },
        webappUrl: function () { return HALL_OF_FAME_WEBAPP_URL; },
        _setUrl: function (u) { HALL_OF_FAME_WEBAPP_URL = String(u || ''); }  /* 개발 점검용 */
    };
    window.HOF = HOF;

    /* 페이지가 자기 게임을 알려 주면 자동 초기화 */
    function auto() {
        var g = window.HOF_GAME;
        if (!g) return;
        injectCss();
        init({ game: g.game, result: g.result || null, start: g.start || null, mountTo: g.mountTo || null, pill: g.pill !== false });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', auto);
    } else {
        auto();
    }
})();
