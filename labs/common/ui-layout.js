/* ============================================================
   Science Virtual LAB — 공통 레이아웃 스크립트 (ui-layout.js)
   ------------------------------------------------------------
   1) "실험 조절" 패널(.side-ctrl-panel)의 높이를 재서
      --svl-sideh 변수를 관리
   2) 하단 캡슐 바(.bottom-control-bar, #bar)의 무결성 보장
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

    if (window.MutationObserver) {
        var mo = new MutationObserver(schedule);
        document.querySelectorAll('.sub-panel').forEach(function (el) {
            mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        });
    }
})();
