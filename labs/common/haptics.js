/* ============================================================
   Science Virtual LAB — 햅틱(진동) 공용 헬퍼 (haptics.js)
   ------------------------------------------------------------
   · navigator.vibrate 를 지원하는 기기(Android Chrome 등)에서만 짧게 울린다.
   · iPhone Safari 처럼 지원하지 않는 환경에서는 아무 일도 하지 않고 조용히 넘어간다.
   · 사용자가 끌 수 있다 → SVLHaptic.set(false) / localStorage 'svlHaptic'='0'
   · 쓰는 법
       SVLHaptic.tap()      12ms  (버튼·카드 누름)
       SVLHaptic.step()      8ms  (슬라이더 단계·토글)
       SVLHaptic.impact()   22ms  (충돌·낙하)
       SVLHaptic.success()       (정답·완료)
       SVLHaptic.error()         (오답·실패)
       SVLHaptic.toggle()        (켜기/끄기)
   · 버튼·카드 클릭은 자동으로 가볍게 울린다. 원하는 길이는 data-haptic="18" 로 지정.
   ============================================================ */
(function () {
    'use strict';
    if (window.SVLHaptic) return;

    var KEY = 'svlHaptic';
    var on = true;
    try { if (localStorage.getItem(KEY) === '0') on = false; } catch (e) { }

    var supported = (typeof navigator !== 'undefined') && typeof navigator.vibrate === 'function';

    function reduced() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }

    function buzz(pattern) {
        if (!on || !supported || reduced()) return false;
        try { return navigator.vibrate(pattern); } catch (e) { return false; }
    }

    var API = {
        supported: supported,
        enabled: function () { return on; },
        set: function (v) {
            on = !!v;
            try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { }
            try { document.dispatchEvent(new CustomEvent('svlhapticchange', { detail: { enabled: on } })); } catch (e) { }
            return on;
        },
        toggle: function () { API.set(!on); if (on) buzz(12); return on; },
        tap: function (ms) { return buzz(ms || 12); },
        step: function () { return buzz(8); },
        impact: function () { return buzz(22); },
        success: function () { return buzz([12, 40, 18]); },
        error: function () { return buzz([18, 60, 18]); }
    };
    window.SVLHaptic = API;

    /* 버튼·카드·탭 클릭 자동 햅틱 (캡처 단계라 페이지 스크립트보다 먼저 울린다) */
    var SEL = 'button, .action-btn, .seg-btn, .side-btn, .area-tab, .sub-chip, .lab-card, .back-btn, [role="tab"], [data-haptic]';
    document.addEventListener('click', function (e) {
        var el = e.target;
        while (el && el !== document && !(el.matches && el.matches(SEL))) el = el.parentElement;
        if (!el || el === document) return;
        var raw = el.getAttribute && el.getAttribute('data-haptic');
        var ms = raw ? (parseInt(raw, 10) || 12) : 12;
        buzz(Math.max(8, Math.min(25, ms)));
    }, true);
})();
