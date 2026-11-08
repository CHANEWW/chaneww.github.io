/* ============================================================
   Science Virtual LAB — 공통 제안하기 모듈 (자율 주입 스크립트)
   ------------------------------------------------------------
   모든 실험실 페이지에서 아래 한 줄만 넣으면 동작합니다.
     <script src="../common/feedback.js" defer></script>
   - 💡 제안하기 버튼을 야간모드(🌙) 버튼 왼쪽에 자동 배치
     (테마 버튼이 없으면 우측 상단에 고정 배치)
   - 제출: Google Forms 실시간 전송(fetch no-cors, 실패 시 숨김 iframe)
     + localStorage('svl_pending_feedbacks') 이중 보관
   ============================================================ */
(function () {
    'use strict';
    if (window.__SVL_FEEDBACK_LOADED__) return;
    window.__SVL_FEEDBACK_LOADED__ = true;

    /* ---------- 설정 ---------- */
    var FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfTaFmpeQVPC9dNJyEx9QHK41N7rQWgniFXx5RzOghzj6FD3Q/formResponse';
    var ENTRY = {
        lab:     'entry.321212161',   // 실험실명
        role:    'entry.949437353',   // 작성자 구분 (학생/선생님/일반)
        type:    'entry.1919395753',  // 제안 유형
        content: 'entry.1035607842',  // 제안 내용
        email:   'entry.1351422918'   // 이메일 (선택)
    };
    var STORAGE_KEY = 'svl_pending_feedbacks';

    /* ---------- 실험명 ---------- */
    var EXPERIMENT = (document.title || '가상실험').trim()
        .replace(/\s*[-|–]\s*Science Virtual LAB\s*$/i, '');
    var EXPERIMENT_ID = (location.pathname || '')
        .replace(/^\/*labs\//, '').replace(/\.html$/, '') || 'unknown';

    /* ---------- CSS 로드 (스크립트 경로 기준) ---------- */
    (function loadCss() {
        var src = (document.currentScript && document.currentScript.src) || '';
        var href = src ? src.replace(/feedback\.js([?#].*)?$/, 'feedback.css') : '';
        if (!href) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    })();

    /* ---------- 버튼 ---------- */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'svl-fb-btn';
    btn.id = 'feedback-btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-controls', 'feedback-overlay');
    btn.setAttribute('aria-label', '제안하기');
    btn.title = '제안하기';
    btn.innerHTML = '<span class="fb-open-icon">💡</span><span class="fb-open-label">제안하기</span>';

    function placeBtn() {
        var theme = document.getElementById('theme-toggle')
                 || document.getElementById('bTheme')
                 || document.getElementById('themeBtn');
        var r = null;
        try { r = theme ? theme.getBoundingClientRect() : null; } catch (e) { r = null; }
        if (r && r.width > 0 && r.height > 0) {
            var needed = (btn.offsetWidth || 110) + 6;
            var free = Infinity;
            var prev = theme.previousElementSibling;   // 같은 바 안의 왼쪽 요소(데이터 카드 등)
            if (prev) {
                try {
                    var pr = prev.getBoundingClientRect();
                    if (pr && pr.width > 0) free = r.left - pr.right;
                } catch (e) { free = Infinity; }
            }
            if (free >= needed) {
                // 달 버튼 왼쪽에 공간이 있으면 그 자리에 붙인다
                btn.style.top = Math.round(r.top + r.height / 2) + 'px';
                btn.style.right = Math.max(8, Math.round(window.innerWidth - r.left + 8)) + 'px';
                btn.style.transform = 'translateY(-50%)';
            } else {
                // 공간이 부족하면 달 버튼 바로 아래, 우측 정렬로 내린다
                btn.style.top = Math.round(r.bottom + 8) + 'px';
                btn.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
                btn.style.transform = 'none';
            }
        } else {
            btn.style.top = '';
            btn.style.right = '';
            btn.style.transform = '';
        }
    }
    document.body.appendChild(btn);
    placeBtn();
    window.addEventListener('resize', placeBtn);
    window.addEventListener('orientationchange', placeBtn);
    window.addEventListener('pageshow', placeBtn);

    /* ---------- 모달 DOM ---------- */
    var overlay = document.createElement('div');
    overlay.className = 'svl-fb-overlay';
    overlay.id = 'feedback-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'feedback-title');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
        '<div class="fb-card" id="feedback-card">' +
            '<div class="fb-head">' +
                '<div class="fb-head-text">' +
                    '<div class="fb-title" id="feedback-title">💡 제안하기</div>' +
                    '<div class="fb-subtitle">실험을 쓰다가 불편했던 점이나 아이디어를 들려주세요.</div>' +
                '</div>' +
                '<button class="fb-close" id="feedback-close" type="button" aria-label="닫기">✕</button>' +
            '</div>' +
            '<div class="fb-exp"><span>🧪</span><span class="fb-exp-name" id="fb-exp-name"></span></div>' +
            '<form class="fb-body" id="feedback-form" novalidate>' +
                '<div class="fb-field">' +
                    '<div class="fb-label">작성자 구분</div>' +
                    '<div class="fb-seg" id="fb-role-group" role="radiogroup" aria-label="작성자 구분">' +
                        '<button type="button" class="fb-seg-btn active" data-role="학생" role="radio" aria-checked="true">🧑‍🎓 학생</button>' +
                        '<button type="button" class="fb-seg-btn" data-role="선생님" role="radio" aria-checked="false">🧑‍🏫 선생님</button>' +
                        '<button type="button" class="fb-seg-btn" data-role="일반" role="radio" aria-checked="false">🙂 일반</button>' +
                    '</div>' +
                '</div>' +
                '<div class="fb-field">' +
                    '<div class="fb-label">제안 유형</div>' +
                    '<div class="fb-chips" id="fb-type-group" role="radiogroup" aria-label="제안 유형">' +
                        '<button type="button" class="fb-chip active" data-type="기능 제안" role="radio" aria-checked="true">✨ 기능 제안</button>' +
                        '<button type="button" class="fb-chip" data-type="과학 원리 오류 제보" role="radio" aria-checked="false">🔬 과학 원리 오류 제보</button>' +
                        '<button type="button" class="fb-chip" data-type="조작 불편" role="radio" aria-checked="false">🖐️ 조작 불편</button>' +
                        '<button type="button" class="fb-chip" data-type="수업 아이디어" role="radio" aria-checked="false">🏫 수업 아이디어</button>' +
                    '</div>' +
                '</div>' +
                '<div class="fb-field">' +
                    '<label class="fb-label" for="fb-content">제안 내용 <span class="fb-req">필수</span></label>' +
                    '<textarea id="fb-content" class="fb-textarea" rows="4" maxlength="1000" placeholder="이 실험에서 불편했거나, 추가되었으면 하는 기능, 혹은 과학적 오류가 있다면 자유롭게 적어주세요."></textarea>' +
                    '<div class="fb-counter"><span id="fb-count">0</span>/1000</div>' +
                '</div>' +
                '<div class="fb-field">' +
                    '<label class="fb-label" for="fb-email">이메일 <span class="fb-opt">선택</span></label>' +
                    '<input type="email" id="fb-email" class="fb-input" inputmode="email" autocomplete="email" placeholder="답변을 받고 싶다면 이메일 주소를 적어주세요">' +
                '</div>' +
                '<div class="fb-error" id="fb-error" role="alert"></div>' +
                '<div class="fb-actions">' +
                    '<button type="button" class="fb-btn-cancel" id="feedback-cancel">취소</button>' +
                    '<button type="submit" class="fb-btn-submit" id="feedback-submit">제안 제출하기</button>' +
                '</div>' +
            '</form>' +
            '<div class="fb-success" id="fb-success" aria-live="polite">' +
                '<div class="fb-success-icon">✅</div>' +
                '<div class="fb-success-title">제안을 보냈습니다</div>' +
                '<div class="fb-success-msg">소중한 의견 감사합니다!<br>박찬우 선생님과 검토 후 업데이트에 반영하겠습니다.</div>' +
                '<div class="fb-success-sub">잠시 후 자동으로 닫힙니다…</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var toastEl = document.createElement('div');
    toastEl.className = 'fb-toast';
    toastEl.id = 'fb-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);

    /* ---------- 요소 ---------- */
    var card      = document.getElementById('feedback-card');
    var closeBtn  = document.getElementById('feedback-close');
    var cancelBtn = document.getElementById('feedback-cancel');
    var form      = document.getElementById('feedback-form');
    var contentEl = document.getElementById('fb-content');
    var emailEl   = document.getElementById('fb-email');
    var countEl   = document.getElementById('fb-count');
    var errEl     = document.getElementById('fb-error');
    var roleGroup = document.getElementById('fb-role-group');
    var typeGroup = document.getElementById('fb-type-group');
    var expNameEl = document.getElementById('fb-exp-name');
    var submitBtn = document.getElementById('feedback-submit');
    expNameEl.textContent = EXPERIMENT;

    /* ---------- 테마 동기화 (실험실마다 다크모드 구현이 다르므로 자동 판별) ---------- */
    function isDarkTheme() {
        var cls = document.body.classList;
        if (cls.contains('dark-mode') || cls.contains('dark') || cls.contains('darkmode')) return true;
        if (cls.contains('light-mode') || cls.contains('light')) return false;
        var bgs = [document.body, document.documentElement];
        for (var i = 0; i < bgs.length; i++) {
            var m = (getComputedStyle(bgs[i]).backgroundColor || '').match(/[\d.]+/g);
            var alpha = (m && m.length >= 4) ? +m[3] : 1;
            if (m && m.length >= 3 && alpha > 0.05) {
                var lum = (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
                return lum < 0.5;
            }
        }
        return false;
    }
    function syncTheme() {
        var dark = isDarkTheme();
        document.body.classList.toggle('svl-fb-dark', dark);
    }
    syncTheme();
    if (window.MutationObserver) {
        new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- 토스트 / 오류 ---------- */
    var toastTimer = null;
    function toast(msg, ms) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2400);
    }
    function showError(msg, target) {
        if (errEl) { errEl.textContent = '⚠️ ' + msg; errEl.classList.add('show'); }
        if (target) {
            target.classList.add('error');
            try { target.focus({ preventScroll: false }); } catch (e) { target.focus(); }
            setTimeout(function () { target.classList.remove('error'); }, 900);
        }
    }
    function clearError() {
        if (errEl) { errEl.classList.remove('show'); errEl.textContent = ''; }
        contentEl.classList.remove('error');
        emailEl.classList.remove('error');
    }

    /* ---------- localStorage 이중 보관 ---------- */
    function readQueue() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function saveFeedback(payload) {
        var queue = readQueue();
        queue.push(payload);
        if (queue.length > 200) queue = queue.slice(queue.length - 200);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            return true;
        } catch (e) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify([payload]));
                return true;
            } catch (e2) { return false; }
        }
    }
    function markDelivered(id) {
        try {
            var queue = readQueue();
            for (var i = queue.length - 1; i >= 0; i--) {
                if (queue[i] && queue[i].id === id) { queue[i].delivered = true; break; }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
        } catch (e) { /* 무시 */ }
    }

    /* ---------- 열기 / 닫기 ---------- */
    var closeTimer = null, lastFocus = null;

    function openModal() {
        clearTimeout(closeTimer);
        clearError();
        card.classList.remove('done');
        form.style.display = '';
        lastFocus = document.activeElement;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
        setTimeout(function () {
            var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
            if (contentEl && finePointer) {
                try { contentEl.focus({ preventScroll: true }); } catch (e) { contentEl.focus(); }
            }
        }, 260);
    }
    function closeModal() {
        clearTimeout(closeTimer);
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.height = '';
        overlay.style.top = '';
        btn.setAttribute('aria-expanded', 'false');
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
        setTimeout(resetForm, 220);
    }
    function resetForm() {
        if (form) form.reset();
        var role = '학생', type = '기능 제안';
        if (contentEl) contentEl.value = '';
        if (emailEl) emailEl.value = '';
        if (countEl) countEl.textContent = '0';
        clearError();
        [].forEach.call(roleGroup.querySelectorAll('.fb-seg-btn'), function (b) {
            var on = b.getAttribute('data-role') === role;
            b.classList.toggle('active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        [].forEach.call(typeGroup.querySelectorAll('.fb-chip'), function (b) {
            var on = b.getAttribute('data-type') === type;
            b.classList.toggle('active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        if (card) card.classList.remove('done');
        if (form) form.style.display = '';
    }

    /* ---------- 이벤트 ---------- */
    btn.addEventListener('click', openModal);
    if (closeBtn)  closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
    });

    roleGroup.addEventListener('click', function (e) {
        var b = e.target.closest('.fb-seg-btn');
        if (!b) return;
        [].forEach.call(roleGroup.querySelectorAll('.fb-seg-btn'), function (x) {
            var on = x === b;
            x.classList.toggle('active', on);
            x.setAttribute('aria-checked', on ? 'true' : 'false');
        });
    });

    typeGroup.addEventListener('click', function (e) {
        var b = e.target.closest('.fb-chip');
        if (!b) return;
        [].forEach.call(typeGroup.querySelectorAll('.fb-chip'), function (x) {
            var on = x === b;
            x.classList.toggle('active', on);
            x.setAttribute('aria-checked', on ? 'true' : 'false');
        });
    });

    contentEl.addEventListener('input', function () {
        if (countEl) countEl.textContent = String(contentEl.value.length);
        if (contentEl.value.trim()) clearError();
    });
    emailEl.addEventListener('input', function () {
        if (emailEl.value.trim()) emailEl.classList.remove('error');
    });

    document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('show')) return;
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    });

    /* 모바일 키보드가 올라와도 모달이 가려지지 않도록 가시 영역에 맞춘다 */
    if (window.visualViewport) {
        var vv = window.visualViewport;
        var syncViewport = function () {
            if (!overlay.classList.contains('show')) return;
            overlay.style.height = vv.height + 'px';
            overlay.style.top = vv.offsetTop + 'px';
        };
        vv.addEventListener('resize', syncViewport);
        vv.addEventListener('scroll', syncViewport);
        overlay.addEventListener('transitionend', syncViewport);
    }

    /* ---------- 구글 폼 실시간 전송 ---------- */
    function iframeSubmit(params) {
        try {
            var iframe = document.createElement('iframe');
            iframe.name = 'hidden_gform_iframe';
            iframe.style.display = 'none';
            var f = document.createElement('form');
            f.action = FORM_URL;
            f.method = 'POST';
            f.target = 'hidden_gform_iframe';
            params.forEach(function (v, k) {
                var input = document.createElement('input');
                input.type = 'hidden';
                input.name = k;
                input.value = v;
                f.appendChild(input);
            });
            document.body.appendChild(f);
            document.body.appendChild(iframe);
            f.submit();
            setTimeout(function () { f.remove(); iframe.remove(); }, 15000);
            return true;
        } catch (e) { return false; }
    }

    function sendToGoogle(payload) {
        var params = new URLSearchParams();
        params.append(ENTRY.lab, payload.experiment);
        params.append(ENTRY.role, payload.role);
        params.append(ENTRY.type, payload.type);
        params.append(ENTRY.content, payload.content);
        if (payload.email) params.append(ENTRY.email, payload.email);

        try {
            fetch(FORM_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            }).then(function () {
                markDelivered(payload.id);
            }).catch(function () {
                iframeSubmit(params);   // fetch 실패 시 숨김 iframe으로 재전송
            });
        } catch (e) {
            iframeSubmit(params);
        }
    }

    /* ---------- 제출 ---------- */
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = (contentEl.value || '').trim();
        var mail = (emailEl.value || '').trim();
        var roleEl  = roleGroup.querySelector('.fb-seg-btn.active');
        var typeEl  = typeGroup.querySelector('.fb-chip.active');

        if (!text) {
            showError('제안 내용을 입력해 주세요.', contentEl);
            return;
        }
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) {
            showError('이메일 주소 형식을 확인해 주세요. (답변을 받지 않으셔도 되면 비워두세요.)', emailEl);
            return;
        }

        clearError();
        submitBtn.disabled = true;

        var payload = {
            id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            ts: new Date().toISOString(),
            tsLocal: new Date().toLocaleString('ko-KR'),
            experiment: EXPERIMENT,
            experimentId: EXPERIMENT_ID,
            page: location.pathname,
            role: roleEl ? roleEl.getAttribute('data-role') : '학생',
            type: typeEl ? typeEl.getAttribute('data-type') : '기능 제안',
            content: text,
            email: mail || null,
            delivered: false
        };

        var ok = saveFeedback(payload);
        submitBtn.disabled = false;

        if (!ok) {
            showError('브라우저 저장 공간을 사용할 수 없어 제안을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', contentEl);
            return;
        }

        sendToGoogle(payload);

        card.classList.add('done');
        if (form) form.style.display = 'none';
        toast('제안이 전송되었습니다. 감사합니다!', 1800);

        closeTimer = setTimeout(function () {
            overlay.classList.remove('show');
            overlay.setAttribute('aria-hidden', 'true');
            overlay.style.height = '';
            overlay.style.top = '';
            resetForm();
        }, 2400);
    });
})();
