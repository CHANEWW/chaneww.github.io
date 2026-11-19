/* ============================================================
   Science Virtual LAB — 교사용 업무 도구 공용 모듈 (work-tool.js)
   ------------------------------------------------------------
   · 인증 게이트: work.html 에서 PIN 인증을 마친 같은 탭에서만 열린다.
   · AI Worker 설정(⚙️): localStorage 'svl_ai_worker' 에 주소를 저장하고
     Gemini API 를 중계하는 Cloudflare Worker 를 X-Pin 헤더로 호출한다.
   · Worker 가 없거나 실패하면 각 도구의 '즉시 초안'(draft)으로 대신 채운다.
   · 결과는 축약 마크다운(## 소제목, - 목록, | 표 |)으로 받아 문서로 그린다.

   페이지에서 쓰는 법
     SVLWorkTool.ready(function (WT) { ... });
     WT.generate({ kind:'newsletter', system:'...', prompt:'...', draft:function(){ return '# ...'; } })
       .then(function (r) { WT.paint('#out', r.text); WT.badge(r.source); })
   ============================================================ */
(function () {
    'use strict';
    if (window.SVLWorkTool && window.SVLWorkTool.ready) return;

    var AUTH_KEY = 'svl_work_unlocked';
    var PIN_KEY = 'svl_tt_pin';
    var WORKER_KEY = 'svl_ai_worker';
    var PATH_UP = /\/class\//.test(location.pathname) ? '../' : '';

    var WT = {};
    var booted = false;
    var hooks = [];

    /* ---------------- 저장소 ---------------- */
    function ss(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

    WT.pin = function () { return ss(PIN_KEY); };
    WT.unlocked = function () { return ss(AUTH_KEY) === '1' && !!ss(PIN_KEY); };

    /* ---------------- 언어 ---------------- */
    WT.lang = function () {
        try {
            if (window.SVL_I18N && window.SVL_I18N.lang) {
                var l = window.SVL_I18N.lang();
                if (l) return l;
            }
        } catch (e) {}
        try {
            var s = localStorage.getItem('svlLang');
            if (s) return s;
        } catch (e2) {}
        return 'ko';
    };
    /* 현재 언어의 문구 고르기 — WT.P({ko:'..', en:'..'}) */
    WT.P = function (map) {
        var l = WT.lang();
        return (map && (map[l] || map.ko)) || '';
    };

    /* 칩·선택지의 한국어 값을 현재 언어 문구로 (AI·초안 프롬프트용) */
    var TERMS = {
        '전교생': ['all students', '全校生徒', '全校学生', 'todo el alumnado'],
        '1학년': ['Grade 1', '1年生', '一年级', '1.er curso'],
        '2학년': ['Grade 2', '2年生', '二年级', '2.º curso'],
        '3학년': ['Grade 3', '3年生', '三年级', '3.er curso'],
        '학부모': ['parents', '保護者', '家长', 'familias'],
        '중1': ['Grade 7', '中学1年', '初一', '1.º de secundaria'],
        '중2': ['Grade 8', '中学2年', '初二', '2.º de secundaria'],
        '중3': ['Grade 9', '中学3年', '初三', '3.º de secundaria'],
        '정중하고 따뜻한 안내문': ['warm, courteous notice', '丁寧で温かいお知らせ', '温和有礼的通知', 'aviso cordial y cálido'],
        '간결한 요약형': ['brief summary style', '簡潔な要約型', '简洁摘要型', 'estilo resumen breve'],
        '활발한 참여': ['lively participation', '活発な参加', '积极参与', 'participación activa'],
        '조용한 집중': ['quiet focus', '静かな集中', '安静专注', 'concentración tranquila'],
        '모둠 토의': ['group discussion', 'グループ討議', '小组讨论', 'debate en grupo'],
        '3분': ['3 minutes', '3分', '3 分钟', '3 minutos'],
        '5분': ['5 minutes', '5分', '5 分钟', '5 minutos'],
        '7분': ['7 minutes', '7分', '7 分钟', '7 minutos']
    };
    var TERM_IDX = { en: 0, ja: 1, zh: 2, es: 3 };
    WT.term = function (v) {
        var l = WT.lang();
        if (l === 'ko' || !v) return v;
        var t = TERMS[String(v).trim()];
        return t ? t[TERM_IDX[l]] : v;
    };

    /* ---------------- 토스트 ---------------- */
    var toastEl = null, toastTimer = null;
    WT.toast = function (msg) {
        if (!msg) return;
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'wt-toast';
            toastEl.setAttribute('role', 'status');
            toastEl.setAttribute('aria-live', 'polite');
            toastEl.setAttribute('data-svl-skip', '');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2200);
    };

    /* ---------------- 인증 게이트 ---------------- */
    function gate() {
        if (WT.unlocked()) return true;
        location.replace(PATH_UP + 'work.html');
        return false;
    }
    WT.lock = function () {
        try {
            sessionStorage.removeItem(AUTH_KEY);
            sessionStorage.removeItem(PIN_KEY);
        } catch (e) {}
        location.replace(PATH_UP + 'work.html');
    };

    /* ---------------- AI Worker 설정 ---------------- */
    WT.workerUrl = function () { return lsGet(WORKER_KEY); };
    function normUrl(u) {
        u = String(u || '').trim();
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        return u;
    }
    function endsWithSlash(u) { return /\/$/.test(u) ? u : u + '/'; }

    var modal = null;
    function buildModal() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'wt-modal';
        modal.id = 'wtAiModal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="wt-modal-card" role="dialog" aria-modal="true" aria-labelledby="wtAiTitle">' +
              '<h2 id="wtAiTitle">⚙️ AI Worker</h2>' +
              '<p class="sub">Google Gemini(gemini-2.5-flash)를 중계하는 Cloudflare Worker 주소를 저장합니다. 비워 두면 연결 없이 즉시 초안으로 결과를 만듭니다.</p>' +
              '<div class="wt-fld"><label for="wtAiUrl">Worker 주소</label>' +
                '<input class="wt-in" id="wtAiUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://svl-work-ai.your-name.workers.dev/">' +
                '<p class="wt-hint">PIN은 Worker가 확인합니다. 이 화면에는 PIN도 API 키도 저장하지 않습니다.</p></div>' +
              '<div class="wt-modal-acts">' +
                '<button class="wt-btn primary" id="wtAiSave" type="button">저장하고 연결</button>' +
                '<button class="wt-btn ghost" id="wtAiTest" type="button">연결 테스트</button>' +
                '<button class="wt-btn ghost" id="wtAiClear" type="button">해제</button>' +
              '</div>' +
              '<div class="wt-status" id="wtAiStatus"></div>' +
              '<div class="wt-info"><b>처음 한 번만</b>' +
                '<p>① Cloudflare Workers 에 새 Worker 를 만들고 docs/work_ai_worker.js 코드를 붙여넣습니다.</p>' +
                '<p>② 환경 변수에 GEMINI_API_KEY 와 PIN_CODE 를 넣습니다.</p>' +
                '<p>③ 배포된 주소를 위에 저장하면 세 도구가 모두 AI 로 초안을 씁니다.</p>' +
              '</div>' +
              '<div class="wt-modal-acts"><button class="wt-btn" id="wtAiClose" type="button">닫기</button></div>' +
            '</div>';
        document.body.appendChild(modal);

        var urlEl = modal.querySelector('#wtAiUrl');
        var stEl = modal.querySelector('#wtAiStatus');
        function status(text, kind) {
            stEl.className = 'wt-status' + (kind ? ' ' + kind : '');
            stEl.textContent = text || '';
        }
        function open() {
            urlEl.value = WT.workerUrl();
            status(WT.workerUrl() ? WT.P({ ko: '지금 연결된 주소가 저장되어 있습니다.', en: 'A worker address is saved.', ja: '接続先が保存されています。', zh: '已保存连接地址。', es: 'Hay una dirección guardada.' }) : '', '');
            modal.hidden = false;
            setTimeout(function () { try { urlEl.focus(); } catch (e) {} }, 30);
        }
        function close() { modal.hidden = true; }
        WT.openAiModal = open;

        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
        modal.querySelector('#wtAiClose').addEventListener('click', close);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });

        modal.querySelector('#wtAiSave').addEventListener('click', function () {
            var u = normUrl(urlEl.value);
            if (!u) { status(WT.P({ ko: '주소를 입력해 주세요.', en: 'Enter an address.', ja: 'アドレスを入力してください。', zh: '请输入地址。', es: 'Introduce una dirección.' }), 'err'); return; }
            lsSet(WORKER_KEY, u);
            status(WT.P({ ko: '저장했습니다. 연결을 확인합니다…', en: 'Saved. Checking the connection…', ja: '保存しました。接続を確認します…', zh: '已保存，正在检查连接…', es: 'Guardado. Comprobando la conexión…' }), '');
            ping(u).then(function (ok) {
                status(ok
                    ? WT.P({ ko: '연결되었습니다. 이제 AI가 초안을 씁니다.', en: 'Connected. The AI will write the drafts now.', ja: '接続しました。AIが下書きを書きます。', zh: '已连接，AI 将撰写草稿。', es: 'Conectado. La IA redactará los borradores.' })
                    : WT.P({ ko: '저장했지만 응답이 없습니다. 주소와 PIN 환경변수를 확인해 주세요.', en: 'Saved, but no answer. Check the address and the PIN variable.', ja: '保存しましたが応答がありません。アドレスとPINを確認してください。', zh: '已保存但无响应，请检查地址和 PIN。', es: 'Guardado sin respuesta. Revisa la dirección y el PIN.' }),
                    ok ? 'ok' : 'err');
                paintAiState();
            });
        });
        modal.querySelector('#wtAiTest').addEventListener('click', function () {
            var u = normUrl(urlEl.value) || WT.workerUrl();
            if (!u) { status(WT.P({ ko: '먼저 주소를 입력해 주세요.', en: 'Enter an address first.', ja: '先にアドレスを入力してください。', zh: '请先输入地址。', es: 'Introduce primero una dirección.' }), 'err'); return; }
            status(WT.P({ ko: '확인 중…', en: 'Checking…', ja: '確認中…', zh: '正在检查…', es: 'Comprobando…' }), '');
            ping(u).then(function (ok) {
                status(ok
                    ? WT.P({ ko: '응답이 정상입니다.', en: 'The worker answers correctly.', ja: '正常に応答しています。', zh: '响应正常。', es: 'Responde correctamente.' })
                    : WT.P({ ko: '응답이 없습니다. 주소·PIN을 확인해 주세요.', en: 'No answer. Check the address and PIN.', ja: '応答がありません。アドレスとPINを確認してください。', zh: '无响应，请检查地址和 PIN。', es: 'Sin respuesta. Revisa la dirección y el PIN.' }),
                    ok ? 'ok' : 'err');
            });
        });
        modal.querySelector('#wtAiClear').addEventListener('click', function () {
            lsDel(WORKER_KEY);
            urlEl.value = '';
            status(WT.P({ ko: '연결을 해제했습니다. 즉시 초안으로 동작합니다.', en: 'Disconnected. Drafts only.', ja: '解除しました。即時下書きで動きます。', zh: '已解除，将使用即时草稿。', es: 'Desconectado. Solo borradores.' }), '');
            paintAiState();
        });
        return modal;
    }

    function paintAiState() {
        var btn = document.getElementById('aiBtn');
        if (!btn) return;
        btn.classList.toggle('on', !!WT.workerUrl());
        btn.title = WT.workerUrl() ? 'AI Worker 연결됨' : 'AI Worker 설정';
    }

    /* ---------------- Worker 호출 ---------------- */
    function fetchWithTimeout(url, opt, ms) {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = null;
        if (ctrl && ms) timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
        opt.signal = ctrl ? ctrl.signal : undefined;
        opt.cache = 'no-store';
        return fetch(url, opt).then(function (r) {
            if (timer) clearTimeout(timer);
            return r;
        }, function (e) {
            if (timer) clearTimeout(timer);
            throw e;
        });
    }

    function ping(url) {
        var u = endsWithSlash(normUrl(url));
        return fetchWithTimeout(u + '?ping=1', { method: 'GET', headers: { 'X-Pin': WT.pin() } }, 15000)
            .then(function (r) {
                /* Worker 가 PIN 일치 여부를 알려 주면 그것을 따른다 (응답이 JSON 이 아닌 경우 상태 코드로 판단) */
                return r.json().then(function (j) {
                    if (j && typeof j === 'object' && 'pin' in j) return !!j.pin;
                    return r.ok;
                }, function () { return r.ok; });
            })
            .catch(function () { return false; });
    }
    WT.ping = ping;

    WT.post = function (body, ms) {
        var url = WT.workerUrl();
        if (!url) return Promise.reject({ reason: 'no-worker' });
        if (!WT.pin()) return Promise.reject({ reason: 'no-pin' });
        return fetchWithTimeout(endsWithSlash(normUrl(url)), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Pin': WT.pin() },
            body: JSON.stringify(body)
        }, ms || 60000).then(function (r) {
            if (r.status === 401 || r.status === 403) return r.text().then(function () { throw { reason: 'pin' }; });
            if (!r.ok) return r.text().then(function (t) { throw { reason: 'http', status: r.status, detail: t }; });
            return r.json();
        }).then(function (j) {
            var text = '';
            if (j && typeof j === 'object') text = j.text || j.output || (j.candidates && j.candidates[0] && j.candidates[0].content) || '';
            else if (typeof j === 'string') text = j;
            if (!text) throw { reason: 'empty' };
            return String(text).trim();
        });
    };

    /* ---------------- 생성 ---------------- */
    /* opts: {kind, system, prompt, draft} */
    WT.generate = function (opts) {
        var body = {
            tool: opts.kind || 'tool',
            lang: WT.lang(),
            system: opts.system || '',
            prompt: opts.prompt || ''
        };
        return WT.post(body).then(function (text) {
            return { text: text, source: 'ai', error: null };
        }).catch(function (err) {
            var t = '';
            try { t = opts.draft ? opts.draft() : ''; } catch (e) { t = ''; }
            if (!t) {
                t = WT.P({
                    ko: '초안을 만들지 못했습니다. 입력을 확인하고 다시 시도해 주세요.',
                    en: 'Could not build a draft. Check the inputs and try again.',
                    ja: '下書きを作れませんでした。入力を確認して再度お試しください。',
                    zh: '未能生成草稿，请检查输入后重试。',
                    es: 'No se pudo crear el borrador. Revisa los datos e inténtalo de nuevo.'
                });
            }
            return { text: t, source: 'draft', error: err || { reason: 'unknown' } };
        });
    };

    /* ---------------- 결과 그리기 ----------------
       축약 마크다운: # 제목 / ## 소제목 / ### 소제목 / - 목록 / 1. 목록 / | 표 | / --- */
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function inline(s) {
        return esc(s)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*\*([^*]+)$/g, '<strong>$1</strong>');
    }
    function isTableRow(ln) {
        var t = ln.trim();
        return t.length > 2 && t.charAt(0) === '|' && t.charAt(t.length - 1) === '|';
    }
    function cells(ln) {
        return ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
    }
    function isSep(ln) { return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(ln.trim()); }

    WT.toHtml = function (md) {
        var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
        var out = [];
        var i = 0, listType = '';
        function closeList() { if (listType) { out.push('</' + listType + '>'); listType = ''; } }
        while (i < lines.length) {
            var ln = lines[i];
            var t = ln.trim();
            if (!t) { closeList(); i++; continue; }

            /* 표 */
            if (isTableRow(t)) {
                var rows = [];
                while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i]); i++; }
                closeList();
                var body = rows.filter(function (r) { return !isSep(r); });
                if (body.length) {
                    out.push('<table>');
                    body.forEach(function (r, idx) {
                        var cs = cells(r);
                        if (idx === 0) {
                            out.push('<thead><tr>' + cs.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>');
                        } else {
                            out.push('<tr>' + cs.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>');
                        }
                    });
                    out.push('</tbody></table>');
                }
                continue;
            }
            /* 제목 */
            var m = /^(#{1,4})\s+(.*)$/.exec(t);
            if (m) {
                closeList();
                var lv = Math.min(m[1].length, 3);
                out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
                i++; continue;
            }
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); out.push('<hr>'); i++; continue; }
            /* 목록 */
            var ul = /^[-*•·]\s+(.*)$/.exec(t);
            var ol = /^(\d+)[.)]\s+(.*)$/.exec(t);
            if (ul || ol) {
                var want = ul ? 'ul' : 'ol';
                if (listType !== want) { closeList(); out.push('<' + want + '>'); listType = want; }
                out.push('<li>' + inline(ul ? ul[1] : ol[2]) + '</li>');
                i++; continue;
            }
            /* 문단 */
            closeList();
            out.push('<p>' + inline(t) + '</p>');
            i++;
        }
        closeList();
        return out.join('\n');
    };

    WT.paint = function (sel, md) {
        var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (!el) return;
        el.innerHTML = '<div class="doc" data-svl-skip>' + WT.toHtml(md) + '</div>';
    };

    /* 축약 마크다운 → 붙여넣기용 평문 (나이스·학교종이 앱) */
    WT.toPlain = function (md) {
        var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (!t) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
            if (isSep(t)) continue;
            if (isTableRow(t)) {
                out.push(cells(t).join(' | '));
                continue;
            }
            var h = /^(#{1,4})\s+(.*)$/.exec(t);
            if (h) { out.push(h[2].replace(/\*\*/g, '')); continue; }
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push(''); continue; }
            var ul = /^[-*•·]\s+(.*)$/.exec(t);
            if (ul) { out.push('• ' + ul[1].replace(/\*\*/g, '')); continue; }
            out.push(t.replace(/\*\*/g, ''));
        }
        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    };

    WT.copy = function (text, okMsg) {
        var plain = WT.toPlain(text);
        function done() { WT.toast(okMsg || WT.P({ ko: '복사했습니다', en: 'Copied', ja: 'コピーしました', zh: '已复制', es: 'Copiado' })); }
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = plain;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, ta.value.length);
                document.execCommand('copy');
                document.body.removeChild(ta);
                done();
            } catch (e) {
                WT.toast(WT.P({ ko: '복사하지 못했습니다. 직접 선택해 주세요.', en: 'Could not copy. Please select it yourself.', ja: 'コピーできませんでした。', zh: '复制失败。', es: 'No se pudo copiar.' }));
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(plain).then(done, fallback);
        } else fallback();
    };

    WT.print = function () { try { window.print(); } catch (e) {} };

    /* 생성 중 버튼 잠금 */
    WT.busy = function (btn, on, label) {
        if (!btn) return;
        if (on) {
            btn.dataset.label = btn.dataset.label || btn.textContent;
            btn.disabled = true;
            if (label) btn.textContent = label;
        } else {
            btn.disabled = false;
            if (btn.dataset.label) { btn.textContent = btn.dataset.label; delete btn.dataset.label; }
        }
    };

    WT.badge = function (sel, source) {
        var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (!el) return;
        var l = WT.lang();
        var map = {
            ai: { ko: '✨ Gemini', en: '✨ Gemini', ja: '✨ Gemini', zh: '✨ Gemini', es: '✨ Gemini' },
            draft: {
                ko: '⚡ 즉시 초안',
                en: '⚡ Instant draft',
                ja: '⚡ 即時下書き',
                zh: '⚡ 即时草稿',
                es: '⚡ Borrador'
            },
            busy: { ko: '작성 중…', en: 'Writing…', ja: '作成中…', zh: '撰写中…', es: 'Escribiendo…' }
        };
        el.className = 'wt-src' + (source === 'ai' ? ' ai' : (source === 'draft' ? ' draft' : ''));
        el.textContent = (map[source] && (map[source][l] || map[source].ko)) || '';
        el.hidden = !source;
    };

    /* ---------------- 시작 ---------------- */
    WT.ready = function (fn) {
        if (booted) { try { fn(WT); } catch (e) {} return; }
        hooks.push(fn);
    };

    function boot() {
        if (booted) return;
        booted = true;
        if (!gate()) return;
        buildModal();
        paintAiState();

        var aiBtn = document.getElementById('aiBtn');
        if (aiBtn) aiBtn.addEventListener('click', function () { WT.openAiModal(); });

        var lockBtn = document.getElementById('lockBtn');
        if (lockBtn) lockBtn.addEventListener('click', function () { WT.lock(); });

        /* 다른 탭에서 잠그면 이 탭도 따라간다 */
        window.addEventListener('storage', function (e) {
            if (e.key === AUTH_KEY && e.newValue === null && !WT.unlocked()) gate();
        });

        hooks.forEach(function (fn) { try { fn(WT); } catch (e) { console.error(e); } });
        hooks = [];
    }

    window.SVLWorkTool = WT;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
