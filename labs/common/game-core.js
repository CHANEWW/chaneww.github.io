/* ============================================================
   Science Virtual LAB — 웹캠 게임 공통 코어 (game-core.js)
   ------------------------------------------------------------
   🎮 게임 탭의 웹캠·카메라 게임 5종이 함께 쓰는 기반 모듈

   1) 카메라  : getUserMedia + facingMode(user/environment) 전환,
                전면일 때만 좌우 반전(거울), 권한·오류 한국어 안내,
                영상(0~1) → 무대 픽셀 변환(cover 크롭 + 반전) 공통 처리
   2) 인식    : MediaPipe tasks-vision 0.10.14
                HandLandmarker(손 21관절) · PoseLandmarker(몸 33관절)
                CDN 2곳 폴백 + GPU→CPU 폴백 + 실패 시 조용한 강등
   3) 움직임  : 저해상도 프레임 차분(기본 64×48 그리드) — 조명 변화에 강함
   4) 공통 UI : 토스트 · 야간 모드(body.dark-mode) · 전체화면(iOS 폴백)

   사용법 (labs/game/*.html 기준, ui-layout.css 뒤에 한 줄):
     <script src="../common/game-core.js"></script>
   ============================================================ */
(function () {
    'use strict';
    if (window.SVL) return;

    /* ==========================================================
       0. 공통 유틸
       ========================================================== */
    var U = {
        clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
        lerp: function (a, b, t) { return a + (b - a) * t; },
        rand: function (a, b) { return a + Math.random() * (b - a); },
        randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
        dist: function (x1, y1, x2, y2) { return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)); },
        pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
        roundRect: function (ctx, x, y, w, h, r) {
            r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        },
        /* 선분(블레이드 궤적)과 원(표적)의 충돌 */
        segCircle: function (x1, y1, x2, y2, cx, cy, r) {
            var dx = x2 - x1, dy = y2 - y1;
            var len2 = dx * dx + dy * dy;
            var t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            var px = x1 + dx * t, py = y1 + dy * t;
            return Math.hypot(cx - px, cy - py) <= r;
        },
        /* 반직선(광선)과 원의 충돌 — 사격 판정 */
        rayCircle: function (ox, oy, dx, dy, cx, cy, r) {
            var fx = cx - ox, fy = cy - oy;
            var proj = fx * dx + fy * dy;
            if (proj < 0) return -1;
            var px = ox + dx * proj, py = oy + dy * proj;
            return Math.hypot(cx - px, cy - py) <= r ? proj : -1;
        },
        fmtSec: function (s) {
            s = Math.max(0, s);
            return s >= 10 ? Math.ceil(s) + '초' : (Math.ceil(s * 10) / 10).toFixed(1) + '초';
        }
    };

    /* ==========================================================
       1. 토스트
       ========================================================== */
    var toastEl = null, toastTimer = null;
    function toast(msg, ms) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'svl-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600);
    }

    /* ==========================================================
       2. 야간 모드
       ========================================================== */
    function initTheme(btn, key) {
        var b = typeof btn === 'string' ? document.getElementById(btn) : btn;
        key = key || 'svl_game_theme';
        function apply(dark) {
            document.body.classList.toggle('dark-mode', !!dark);
            if (b) {
                b.textContent = dark ? '☀️' : '🌙';
                b.title = dark ? '주간 모드' : '야간 모드';
                b.setAttribute('aria-label', b.title);
                b.setAttribute('aria-pressed', dark ? 'true' : 'false');
            }
            try { localStorage.setItem(key, dark ? '1' : '0'); } catch (e) { }
        }
        var saved = null;
        try { saved = localStorage.getItem(key); } catch (e) { }
        apply(saved === '1');
        if (b) b.addEventListener('click', function () {
            apply(!document.body.classList.contains('dark-mode'));
        });
        return {
            apply: apply,
            isDark: function () { return document.body.classList.contains('dark-mode'); }
        };
    }

    /* ==========================================================
       3. 전체화면 (브라우저 미지원·iOS는 상단 바 숨김 몰입 모드)
       ========================================================== */
    function initFullscreen(btn, iconEl, textEl) {
        var b = typeof btn === 'string' ? document.getElementById(btn) : btn;
        var ic = typeof iconEl === 'string' ? document.getElementById(iconEl) : iconEl;
        var tx = typeof textEl === 'string' ? document.getElementById(textEl) : textEl;
        var root = document.documentElement;
        var PSEUDO = 'pseudo-fs';
        function isReal() {
            return !!(document.fullscreenElement || document.webkitFullscreenElement ||
                document.mozFullScreenElement || document.msFullscreenElement);
        }
        function isPseudo() { return document.body.classList.contains(PSEUDO); }
        function sync() {
            var on = isReal() || isPseudo();
            if (ic) ic.textContent = on ? '🗗' : '⛶';
            if (tx) tx.textContent = on ? '창모드' : '전체화면';
            if (b) {
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                b.setAttribute('aria-label', on ? '창모드로 전환' : '전체화면으로 전환');
            }
        }
        function enterPseudo() {
            if (isReal()) return;
            document.body.classList.add(PSEUDO);
            sync();
        }
        if (b) b.addEventListener('click', function () {
            if (isReal()) {
                var exit = document.exitFullscreen || document.webkitExitFullscreen ||
                    document.mozCancelFullScreen || document.msExitFullscreen;
                try { if (exit) { var q = exit.call(document); if (q && q.catch) q.catch(function () { }); } } catch (e) { }
                sync(); return;
            }
            if (isPseudo()) { document.body.classList.remove(PSEUDO); sync(); return; }
            var req = root.requestFullscreen || root.webkitRequestFullscreen ||
                root.mozRequestFullScreen || root.msRequestFullscreen;
            if (!req) { enterPseudo(); return; }
            try {
                var p = req.call(root);
                if (p && typeof p.then === 'function') p.then(sync, enterPseudo);
                else setTimeout(function () { if (!isReal() && !isPseudo()) enterPseudo(); else sync(); }, 500);
            } catch (e) { enterPseudo(); }
            sync();
        });
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
            document.addEventListener(ev, function () {
                if (isReal()) document.body.classList.remove(PSEUDO);
                sync();
            });
        });
        document.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.key === 'Esc') && isPseudo() && !isReal()) {
                document.body.classList.remove(PSEUDO); sync();
            }
        });
        window.addEventListener('resize', sync);
        sync();
        return { sync: sync, isOn: function () { return isReal() || isPseudo(); } };
    }

    /* ==========================================================
       4. 카메라 (전면/후면 + 거울 + 좌표 변환 + 배경 그리기)
       ========================================================== */
    var CDN = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
        'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
    ];
    var WASM = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm'
    ];
    var HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
    var POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

    function explainCamError(err) {
        var n = (err && err.name) || '';
        if (n === 'NotAllowedError' || n === 'SecurityError') return '웹캠 권한이 거부되었어요(주소창의 카메라 아이콘에서 허용)';
        if (n === 'NotFoundError' || n === 'OverconstrainedError') return '웹캠을 찾지 못했어요';
        if (n === 'NotReadableError') return '다른 앱이 웹캠을 쓰고 있어요';
        if (n === 'NotSupportedError') return '이 브라우저는 웹캠을 지원하지 않아요';
        return '웹캠을 켜지 못했어요(' + (n || '알 수 없는 오류') + ')';
    }

    function facingLabel(f) { return f === 'environment' ? '후면' : '전면'; }

    function detectFacing(stream) {
        try {
            var t = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
            var st = (t && t.getSettings) ? t.getSettings() : {};
            if (st.facingMode === 'user' || st.facingMode === 'environment') return st.facingMode;
            var lbl = ((t && t.label) || '').toLowerCase();
            if (/back|rear|environment|후면/.test(lbl)) return 'environment';
            if (/front|user|face|전면/.test(lbl)) return 'user';
        } catch (e) { }
        return '';
    }

    function createCamera(opts) {
        opts = opts || {};
        var video = opts.video;
        if (!video) {
            video = document.createElement('video');
            video.setAttribute('playsinline', '');
            video.playsInline = true;
            video.muted = true;
            video.autoplay = true;
            video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
            document.body.appendChild(video);
        }
        var savedFacing = 'user';
        try {
            savedFacing = localStorage.getItem('svl_game_facing') === 'environment' ? 'environment' : 'user';
        } catch (e) { }

        var st = {
            on: false,
            facing: savedFacing,
            busy: false,
            mirror: savedFacing === 'user',
            err: '',
            label: ''        // 이 기기에서 실제로 열린 카메라 방향(모르면 '')
        };
        var stream = null;

        function emit() {
            if (opts.onChange) { try { opts.onChange(info()); } catch (e) { } }
        }
        function status(msg, kind) {
            st.status = msg; st.kind = kind || '';
            if (opts.onStatus) { try { opts.onStatus(msg, kind || ''); } catch (e) { } }
        }
        function info() {
            return {
                on: st.on, facing: st.facing, label: facingLabel(st.facing),
                mirror: st.mirror, busy: st.busy, err: st.err,
                ready: !!(video.videoWidth > 0)
            };
        }

        function openStream(facing) {
            var plain = { width: { ideal: 640 }, height: { ideal: 480 } };
            var want = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: facing } };
            return navigator.mediaDevices.getUserMedia({ video: want, audio: false })
                .catch(function (err) {
                    if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError' || err.name === 'TypeError')) {
                        return navigator.mediaDevices.getUserMedia({ video: plain, audio: false });
                    }
                    throw err;
                });
        }
        function attach(s) {
            stream = s;
            video.srcObject = s;
            return video.play().catch(function () { });
        }
        function detach() {
            if (stream) {
                stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { } });
                stream = null;
            }
            try { video.srcObject = null; } catch (e) { }
        }

        function start() {
            if (st.on || st.busy) return Promise.resolve(st.on);
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                st.err = '이 브라우저는 웹캠을 지원하지 않아요';
                status(st.err + ' · 마우스·터치로 즐길 수 있어요', 'err');
                emit();
                return Promise.resolve(false);
            }
            st.busy = true;
            status('웹캠 권한을 허용해 주세요');
            emit();
            return openStream(st.facing).then(function (s) {
                var actual = detectFacing(s);
                if (actual) { st.label = actual; st.facing = actual; st.mirror = actual === 'user'; }
                return attach(s);
            }).then(function () {
                st.on = true; st.busy = false; st.err = '';
                try { localStorage.setItem('svl_game_facing', st.facing); } catch (e) { }
                status('카메라 켜짐 · ' + facingLabel(st.facing) + (st.mirror ? ' (거울 모드)' : ''), 'live');
                emit();
                return true;
            }).catch(function (e) {
                st.on = false; st.busy = false;
                st.err = explainCamError(e);
                detach();
                status(st.err + ' · 마우스·터치로 즐길 수 있어요', 'err');
                toast(st.err + ' · 마우스로도 즐길 수 있어요');
                emit();
                return false;
            });
        }

        function stop() {
            detach();
            st.on = false; st.err = ''; st.busy = false;
            status('카메라 꺼짐 · 마우스·터치로 즐길 수 있어요');
            emit();
        }

        function setFacing(next, silent) {
            if (next !== 'user' && next !== 'environment') return Promise.resolve(false);
            if (next === st.facing && st.on) return Promise.resolve(true);
            if (!st.on) {
                st.facing = next;
                st.mirror = next === 'user';
                try { localStorage.setItem('svl_game_facing', next); } catch (e) { }
                if (!silent) toast(facingLabel(next) + ' 카메라로 설정했어요 · 카메라를 켜면 적용됩니다');
                status('카메라 꺼짐 · ' + facingLabel(next) + ' 카메라로 시작합니다');
                emit();
                return Promise.resolve(true);
            }
            if (st.busy) return Promise.resolve(false);
            st.busy = true;
            status(facingLabel(next) + ' 카메라로 전환하는 중…', 'live');
            emit();
            var prev = st.facing;
            detach();
            return openStream(next).then(function (s) {
                var actual = detectFacing(s);
                if (!actual) {
                    return navigator.mediaDevices.enumerateDevices().then(function (list) {
                        var n = list.filter(function (d) { return d.kind === 'videoinput'; }).length;
                        return n >= 2 ? next : prev;
                    }).catch(function () { return next; }).then(function (a) {
                        st.facing = a; st.label = a;
                        return attach(s).then(function () { return a === next; });
                    });
                }
                st.facing = actual; st.label = actual;
                return attach(s).then(function () { return actual === next; });
            }).then(function (ok) {
                st.mirror = st.facing === 'user';
                st.busy = false;
                try { localStorage.setItem('svl_game_facing', st.facing); } catch (e) { }
                status('카메라 켜짐 · ' + facingLabel(st.facing) + (st.mirror ? ' (거울 모드)' : ''), 'live');
                if (!ok) toast('이 기기에는 ' + facingLabel(next) + ' 카메라가 없어 ' + facingLabel(st.facing) + ' 카메라로 계속해요');
                else if (!silent) toast('📷 ' + facingLabel(st.facing) + ' 카메라로 전환했어요' + (st.mirror ? ' · 거울 모드로 보여요' : ''));
                emit();
                return true;
            }).catch(function (e) {
                st.busy = false;
                var msg = explainCamError(e);
                status('카메라를 ' + facingLabel(next) + '(으)로 전환하지 못했어요 · ' + msg, 'err');
                toast('카메라 전환 실패 · ' + msg);
                detach(); st.on = false;
                emit();
                return false;
            });
        }

        function toggleFacing() {
            return setFacing(st.facing === 'user' ? 'environment' : 'user');
        }

        function metrics(W, H) {
            var vw = video.videoWidth || 640, vh = video.videoHeight || 480;
            var s = Math.max(W / vw, H / vh);
            var dw = vw * s, dh = vh * s;
            return { vw: vw, vh: vh, scale: s, dw: dw, dh: dh, dx: (W - dw) / 2, dy: (H - dh) / 2 };
        }

        /* 영상 정규화 좌표(0~1) → 무대 픽셀. 전면 카메라일 때만 좌우 반전 */
        function toStage(nx, ny, W, H) {
            var m = metrics(W, H);
            var x = m.dx + (st.mirror ? (1 - nx) : nx) * m.dw;
            return { x: x, y: m.dy + ny * m.dh };
        }

        function drawCover(ctx, W, H, alpha) {
            if (!st.on || !video.videoWidth) return false;
            var m = metrics(W, H);
            ctx.save();
            ctx.globalAlpha = alpha === undefined ? 1 : alpha;
            if (st.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
            try { ctx.drawImage(video, m.dx, m.dy, m.dw, m.dh); } catch (e) { }
            ctx.restore();
            return true;
        }

        return {
            video: video,
            state: st,
            info: info,
            start: start,
            stop: stop,
            setFacing: setFacing,
            toggleFacing: toggleFacing,
            isOn: function () { return st.on; },
            isMirror: function () { return st.mirror; },
            facing: function () { return st.facing; },
            facingLabel: function () { return facingLabel(st.facing); },
            metrics: metrics,
            toStage: toStage,
            drawCover: drawCover,
            status: function () { return st.status || ''; }
        };
    }

    /* ==========================================================
       5. MediaPipe 랜드마크 (손 21 · 몸 33)
       ========================================================== */
    var tasksPromise = null, fileset = null;

    function loadTasks() {
        if (tasksPromise) return tasksPromise;
        tasksPromise = (function () {
            var mod = null, err = null;
            function nextMod(i) {
                if (i >= CDN.length) return Promise.reject(err || new Error('mediapipe load failed'));
                return import(CDN[i]).then(function (m) { mod = m; }, function (e) {
                    err = e;
                    return nextMod(i + 1);
                });
            }
            return nextMod(0).then(function () {
                function nextFs(i) {
                    if (i >= WASM.length) return Promise.reject(err || new Error('wasm load failed'));
                    return mod.FilesetResolver.forVisionTasks(WASM[i]).then(function (f) { fileset = f; }, function (e) {
                        err = e;
                        return nextFs(i + 1);
                    });
                }
                return nextFs(0);
            }).then(function () { return mod; });
        })().catch(function (e) {
            tasksPromise = null;
            throw e;
        });
        return tasksPromise;
    }

    var trackers = {
        hand: { p: null, state: 'idle' },
        pose: { p: null, state: 'idle' }
    };

    function loadTags(kind) {
        return loadTasks().then(function (mod) {
            var maker = kind === 'hand' ? mod.HandLandmarker : mod.PoseLandmarker;
            if (!maker) throw new Error('landmarker missing');
            var opts = kind === 'hand'
                ? {
                    baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
                    runningMode: 'VIDEO', numHands: 2,
                    minHandDetectionConfidence: 0.35,
                    minHandPresenceConfidence: 0.35,
                    minTrackingConfidence: 0.35
                }
                : {
                    baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
                    runningMode: 'VIDEO', numPoses: 1,
                    minPoseDetectionConfidence: 0.4,
                    minPosePresenceConfidence: 0.4,
                    minTrackingConfidence: 0.4
                };
            return maker.createFromOptions(fileset, opts).catch(function () {
                opts.baseOptions.delegate = 'CPU';
                return maker.createFromOptions(fileset, opts);
            });
        });
    }

    function tracker(kind) {
        var t = trackers[kind];
        return {
            get: function () {
                if (t.p) return t.p;
                if (t.state === 'loading') return t.p;
                t.state = 'loading';
                t.p = loadTags(kind).then(function (lm) {
                    t.state = 'ready';
                    return lm;
                }, function (e) {
                    t.state = 'error';
                    t.p = null;
                    throw e;
                });
                return t.p;
            },
            state: function () { return t.state; }
        };
    }

    /* 손 21관절 뼈대 연결 */
    var HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
        [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
    ];
    var FINGERTIPS = [4, 8, 12, 16, 20];

    /* ==========================================================
       6. 움직임 감지 (프레임 차분)
       ========================================================== */
    function createMotion(o) {
        o = o || {};
        var gw = o.w || 64, gh = o.h || 48;
        var thr = o.thr || 18;
        var cv = document.createElement('canvas');
        cv.width = gw; cv.height = gh;
        var g = cv.getContext('2d', { willReadFrequently: true });
        var prev = null;
        var grid = new Float32Array(gw * gh);
        var score = 0, peak = 0;

        function reset() { prev = null; score = 0; peak = 0; grid.fill(0); }

        function sample(video) {
            if (!video || video.readyState < 2 || !video.videoWidth) return 0;
            try { g.drawImage(video, 0, 0, gw, gh); } catch (e) { return score; }
            var data;
            try { data = g.getImageData(0, 0, gw, gh).data; } catch (e) { return score; }
            var n = gw * gh;
            if (!prev) {
                prev = new Uint8Array(n);
                for (var k = 0; k < n; k++) {
                    var q = k * 4;
                    prev[k] = (data[q] * 0.299 + data[q + 1] * 0.587 + data[q + 2] * 0.114) | 0;
                }
                return 0;
            }
            var changed = 0, sum = 0;
            for (var i = 0; i < n; i++) {
                var p = i * 4;
                var L = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
                var diff = Math.abs(L - prev[i]);
                prev[i] = L;
                var v = diff > thr ? Math.min(1, (diff - thr) / (thr * 2.0)) : 0;
                var sm = grid[i] * 0.45 + v * 0.55;
                grid[i] = sm;
                sum += sm;
                if (sm > 0.22) changed++;
            }
            score = changed / n;
            /* 순간 최고치(작은 움직임도 놓치지 않도록)를 0.6초 정도 유지 */
            peak = Math.max(score, peak * 0.9);
            return score;
        }

        return {
            w: gw, h: gh, grid: grid,
            sample: sample,
            reset: reset,
            score: function () { return score; },
            peak: function () { return peak; },
            setThreshold: function (v) { thr = v; }
        };
    }

    /* ==========================================================
       7. 내보내기
       ========================================================== */
    window.SVL = {
        VERSION: '1.0.0',
        utils: U,
        toast: toast,
        initTheme: initTheme,
        initFullscreen: initFullscreen,
        createCamera: createCamera,
        handTracker: tracker('hand'),
        poseTracker: tracker('pose'),
        createMotion: createMotion,
        explainCamError: explainCamError,
        HAND_CONNECTIONS: HAND_CONNECTIONS,
        FINGERTIPS: FINGERTIPS,
        CDN: CDN,
        WASM: WASM
    };
})();
