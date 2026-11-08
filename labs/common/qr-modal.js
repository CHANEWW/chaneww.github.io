/* ============================================================
   Science Virtual LAB — 대형 QR 코드 모달 (labs/common/qr-modal.js)
   ------------------------------------------------------------
   사용법: 페이지마다 아래 두 줄 + 헤더의 [📱 QRcode] 버튼 하나면 끝.
     <link rel="stylesheet" href="…/common/qr-modal.css">
     <script src="…/common/lib/qrcode.min.js" defer></script>
     <script src="…/common/qr-modal.js" defer></script>

   - 버튼: id="qrBtn" (index.html은 id="qrNavBtn")
   - QR 내용: 현재 페이지의 고유 정적 URL (쿼리·해시 제외)
   - QR 생성: 로컬 qrcode.min.js (외부 CDN 사용 안 함)
   - 닫기: 배경 클릭 / ✕ 버튼 / 닫기 버튼 / ESC
   - 실험실 이름: 버튼의 data-qr-title 이 있으면 그것, 없으면 문서 제목
   ============================================================ */
(function () {
    'use strict';
    if (window.__SVL_QR_MODAL__) return;
    window.__SVL_QR_MODAL__ = true;

    var BTN_SELECTOR = '#qrBtn, #qrNavBtn, .qr-btn, .qr-nav-btn';
    var TITLE_TEXT = '📱 스마트폰·태블릿으로 바로 접속';
    var HINT_TEXT = '교실 칠판에 띄우거나 학습지에 인쇄하여 바로 활용할 수 있습니다.';
    var SVG_NS = 'http://www.w3.org/2000/svg';

    var overlay = null;
    var card = null;
    var qrBox = null;
    var nameEl = null;
    var urlEl = null;
    var closeX = null;
    var lastFocus = null;
    var renderSize = 0;
    var resizeTimer = null;

    /* ---------- URL / 이름 ---------- */
    function canonicalUrl() {
        var path = window.location.pathname || '/';
        path = path.replace(/\/index\.html$/i, '/');
        var host = (window.location.hostname || '').toLowerCase();
        var origin = window.location.origin;
        var isLocal = !host || host === 'localhost' || host === '127.0.0.1' ||
            host === '0.0.0.0' || window.location.protocol === 'file:';
        if (isLocal || !origin || origin === 'null') {
            origin = 'https://chaneww.github.io';
        }
        return origin + path;
    }

    function pageName(btn) {
        var custom = btn && btn.getAttribute('data-qr-title');
        if (custom) return custom.trim();
        var title = (document.title || '').trim();
        title = title.replace(/\s*[|·\-–]\s*Science Virtual LAB\s*$/i, '').trim();
        return title;
    }

    /* ---------- QR 크기 계산 ----------
       데스크톱 320~400px, 모바일은 화면 폭의 약 78%
       (세로가 짧은 가로 화면은 QR을 왼쪽에 두고 오른쪽에 안내를 배치) */
    function fitSize() {
        var vw = window.innerWidth || 1024;
        var vh = window.innerHeight || 768;
        var size;
        if (vw > vh && vh <= 560) {
            size = Math.min(420, Math.round(vw * 0.44), Math.round(vh - 72));
        } else {
            size = Math.min(420, Math.round(vw * 0.78), Math.round(vh - 240));
        }
        return Math.max(180, size);
    }

    /* ---------- QR 그림 ----------
       qrcodejs로 QR 데이터를 만든 뒤, 각 칸(모듈)을 정수 좌표로 그린 SVG로 다시 그립니다.
       - 칸 경계가 흐려지지 않아 교실 뒤에서도 잘 읽히고, 인쇄하면 벡터로 선명합니다.
       - QR 규격에 맞는 4칸 여백(quiet zone)을 그림 안에 포함합니다. */
    function buildSvg(model) {
        var count = model.getModuleCount();
        var quiet = 4;
        var total = count + quiet * 2;

        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('shape-rendering', 'crispEdges');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', '실험실 접속 QR 코드');

        var bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('width', String(total));
        bg.setAttribute('height', String(total));
        bg.setAttribute('fill', '#ffffff');
        svg.appendChild(bg);

        var group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('fill', '#000000');

        for (var row = 0; row < count; row++) {
            var col = 0;
            while (col < count) {
                if (model.isDark(row, col)) {
                    var start = col;
                    while (col < count && model.isDark(row, col)) col++;
                    var r = document.createElementNS(SVG_NS, 'rect');
                    r.setAttribute('x', String(start + quiet));
                    r.setAttribute('y', String(row + quiet));
                    r.setAttribute('width', String(col - start));
                    r.setAttribute('height', '1');
                    group.appendChild(r);
                } else {
                    col++;
                }
            }
        }
        svg.appendChild(group);
        return svg;
    }

    /* ---------- 모달 DOM (최초 1회 생성) ---------- */
    function build() {
        if (overlay) return;

        overlay = document.createElement('div');
        overlay.className = 'svl-qr-overlay';
        overlay.id = 'svlQrOverlay';
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });

        card = document.createElement('div');
        card.className = 'svl-qr-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'svlQrTitle');

        closeX = document.createElement('button');
        closeX.type = 'button';
        closeX.className = 'svl-qr-close';
        closeX.setAttribute('aria-label', 'QR 코드 창 닫기');
        closeX.textContent = '✕';
        closeX.addEventListener('click', close);

        var titleEl = document.createElement('h2');
        titleEl.className = 'svl-qr-title';
        titleEl.id = 'svlQrTitle';
        titleEl.textContent = TITLE_TEXT;

        nameEl = document.createElement('div');
        nameEl.className = 'svl-qr-name';

        qrBox = document.createElement('div');
        qrBox.className = 'svl-qr-canvas';
        qrBox.setAttribute('aria-label', 'QR 코드');

        urlEl = document.createElement('p');
        urlEl.className = 'svl-qr-url';

        var hintEl = document.createElement('p');
        hintEl.className = 'svl-qr-hint';
        hintEl.textContent = HINT_TEXT;

        var doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'svl-qr-done';
        doneBtn.textContent = '닫기';
        doneBtn.addEventListener('click', close);

        card.appendChild(closeX);
        card.appendChild(titleEl);
        card.appendChild(nameEl);
        card.appendChild(qrBox);
        card.appendChild(urlEl);
        card.appendChild(hintEl);
        card.appendChild(doneBtn);
        overlay.appendChild(card);
    }

    /* ---------- QR 그리기 ---------- */
    function drawQr(url) {
        if (!qrBox) return;
        qrBox.innerHTML = '';

        var size = fitSize();
        renderSize = size;
        qrBox.style.boxSizing = 'border-box';
        qrBox.style.width = size + 'px';
        qrBox.style.height = size + 'px';
        qrBox.style.padding = '0';

        if (typeof window.QRCode !== 'function') {
            var fail = document.createElement('p');
            fail.className = 'svl-qr-hint';
            fail.textContent = 'QR 코드를 만들 수 없습니다. 아래 주소를 직접 입력해 주세요.';
            qrBox.appendChild(fail);
            return;
        }

        /* qrcodejs 로 QR 데이터 생성 (화면에 그려지는 그림은 아래에서 SVG로 대체) */
        var qr = new window.QRCode(qrBox, {
            text: url,
            width: size,
            height: size,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel.M
        });

        /* 칸 경계가 선명한 SVG 로 다시 그립니다. */
        var model = qr && qr._oQRCode;
        if (model && typeof model.getModuleCount === 'function' && typeof model.isDark === 'function') {
            /* 칸 하나가 화면 실제 픽셀(device px) 정수 개가 되도록 박스 크기를 미세 조정합니다.
               (소수점 크기로 그리면 칸 사이에 흰 줄이 생겨 멀리서 읽기 어려워집니다) */
            var dpr = window.devicePixelRatio || 1;
            var total = model.getModuleCount() + 8;
            var devPerModule = Math.max(3, Math.floor((size * dpr) / total));
            var cssSize = devPerModule * total / dpr;
            qrBox.style.width = cssSize + 'px';
            qrBox.style.height = cssSize + 'px';
            renderSize = Math.round(cssSize);

            qrBox.innerHTML = '';
            qrBox.appendChild(buildSvg(model));
            return;
        }

        /* 폴백: 라이브러리가 그린 그림(캔버스→PNG)을 박스 크기에 맞춰 사용 */
        var made = qrBox.querySelector('img') || qrBox.querySelector('canvas');
        if (made) {
            made.style.width = size + 'px';
            made.style.height = size + 'px';
            made.setAttribute('alt', '실험실 접속 QR 코드');
            made.setAttribute('role', 'img');
        }
    }

    /* ---------- 열기 / 닫기 ---------- */
    function onKeyDown(e) {
        if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
            e.preventDefault();
            close();
        }
    }

    function open(btn) {
        build();
        if (!document.body.contains(overlay)) document.body.appendChild(overlay);

        var url = canonicalUrl();
        nameEl.textContent = pageName(btn);
        urlEl.textContent = url;
        drawQr(url);

        lastFocus = document.activeElement;
        document.body.classList.add('svl-qr-open');
        overlay.classList.add('is-open');
        overlay.removeAttribute('aria-hidden');
        document.addEventListener('keydown', onKeyDown, true);

        window.setTimeout(function () {
            if (closeX && closeX.focus) {
                try { closeX.focus({ preventScroll: true }); } catch (err) { closeX.focus(); }
            }
        }, 40);
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('svl-qr-open');
        document.removeEventListener('keydown', onKeyDown, true);
        var back = lastFocus;
        lastFocus = null;
        if (back && back.focus && document.body.contains(back)) {
            try { back.focus({ preventScroll: true }); } catch (err) { back.focus(); }
        }
    }

    /* ---------- 버튼 연결 ---------- */
    function bind() {
        var btns = document.querySelectorAll(BTN_SELECTOR);
        for (var i = 0; i < btns.length; i++) {
            (function (btn) {
                if (btn.__svlQrBound) return;
                btn.__svlQrBound = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    open(btn);
                });
            })(btns[i]);
        }
    }

    function onResize() {
        if (!overlay || !overlay.classList.contains('is-open')) return;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
            if (Math.abs(fitSize() - renderSize) >= 24) drawQr(canonicalUrl());
        }, 180);
    }

    function init() {
        bind();
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* 필요할 때 직접 호출할 수 있도록 (다른 스크립트에서 사용) */
    window.svlOpenQrModal = function (btn) { open(btn || document.activeElement); };
    window.svlCloseQrModal = close;
})();
