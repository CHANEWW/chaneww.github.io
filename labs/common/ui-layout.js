/* ============================================================
   Science Virtual LAB — 공통 레이아웃 스크립트 (ui-layout.js)
   ------------------------------------------------------------
   ui-layout.css 와 함께 쓰인다.
   - "실험 조절" 패널(.side-ctrl-panel)의 실제 높이를 재서
     --svl-sideh 변수에 넣는다.
   - 모바일에서 설정창(.sub-panel)이 조절 패널을 덮지 않고
     그 위에 뜨도록 CSS 가 이 값을 사용한다.
   - 설정창이 열릴 때/닫힐 때, 화면 크기가 바뀔 때 다시 잰다.
   ============================================================ */
(function () {
    'use strict';
    var root = document.documentElement;
    if (root.getAttribute('data-svl-layout') === 'on') return;
    root.setAttribute('data-svl-layout', 'on');

    function panels() {
        return Array.prototype.slice.call(document.querySelectorAll('.side-ctrl-panel'));
    }

    function measure() {
        var h = 0;
        panels().forEach(function (p) {
            if (!p) return;
            var r = p.getBoundingClientRect();
            var cs = window.getComputedStyle(p);
            var bottom = parseFloat(cs.bottom) || 0;
            var visible = r.height > 0 && cs.display !== 'none';
            if (!visible) return;
            // 화면 아래에서부터 조절 패널의 위쪽 끝까지의 거리
            var used = (window.innerHeight - r.top);
            if (used > h) h = used;
            else if (bottom + r.height > h) h = bottom + r.height;
        });
        root.style.setProperty('--svl-sideh', Math.round(h) + 'px');
    }

    var pending = null;
    function schedule() {
        if (pending) return;
        pending = window.setTimeout(function () {
            pending = null;
            measure();
        }, 60);
    }

    measure();
    window.addEventListener('load', measure);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(measure).catch(function () {}); }

    /* 설정창이 열리고 닫힐 때도 다시 잰다 (class 변화 감시) */
    if (window.MutationObserver) {
        var mo = new MutationObserver(schedule);
        document.querySelectorAll('.sub-panel').forEach(function (el) {
            mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        });
    }
})();
