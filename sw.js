/* ============================================================
   Science Virtual LAB — 서비스 워커 (오프라인 앱 설치)
   ------------------------------------------------------------
   · Network-First: 온라인일 때는 항상 서버의 최신 파일을 먼저 받는다.
     (실험이 자주 업데이트되므로 캐시가 먼저 나오면 안 된다)
   · 오프라인일 때만 캐시로 폴백한다.
   · 캐시 대상: 메인 2종, 매니페스트·아이콘, 공통 라이브러리(Three.js 등)
     방문한 실험 HTML·이미지도 런타임에 함께 캐시해 오프라인에서 다시 열 수 있다.
   ============================================================ */
var CACHE_NAME = 'svl-offline-v1';
var OFFLINE_PAGE = '/index.html';

var PRECACHE = [
    '/index.html',
    '/index_3d.html',
    '/manifest.json',
    '/favicon.svg',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/labs/common/lib/three.min.js',
    '/labs/common/lib/OrbitControls.js',
    '/labs/common/ui-layout.css',
    '/labs/common/ui-layout.js',
    '/labs/common/feedback.css',
    '/labs/common/feedback.js',
    '/labs/common/qr-modal.css',
    '/labs/common/qr-modal.js',
    '/labs/common/hall-of-fame.js',
    '/labs/common/game-core.js',
    '/labs/common/live-weather.js',
    /* 서울남산체 (jsDelivr CORS 허용) — 오프라인에서도 같은 글꼴로 보이게 */
    'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/SeoulNamsanM.woff'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            /* 하나가 없어도 설치가 통째로 실패하지 않도록 개별적으로 담는다 */
            return Promise.all(PRECACHE.map(function (url) {
                return cache.add(new Request(url, { cache: 'reload' })).catch(function () { });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                return k === CACHE_NAME ? null : caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('message', function (event) {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    var url;
    try { url = new URL(req.url); } catch (e) { return; }

    /* 같은 사이트 파일과 폰트 CDN만 다룬다 (그 밖의 요청은 브라우저에 맡긴다) */
    var sameOrigin = url.origin === self.location.origin;
    var isFontCdn = /(^|\.)jsdelivr\.net$/.test(url.hostname);
    if (!sameOrigin && !isFontCdn) return;

    event.respondWith(networkFirst(req));
});

function networkFirst(req) {
    return caches.open(CACHE_NAME).then(function (cache) {
        return fetch(req).then(function (res) {
            /* 성공 응답만 캐시에 남긴다 (404·500은 저장하지 않음) */
            if (res && (res.ok || res.type === 'opaque')) {
                cache.put(req, res.clone()).catch(function () { });
            }
            return res;
        }).catch(function () {
            return cache.match(req, { ignoreSearch: true }).then(function (hit) {
                if (hit) return hit;
                if (req.mode === 'navigate') {
                    return cache.match(OFFLINE_PAGE).then(function (page) {
                        if (page) return page;
                        return offlineNotice();
                    });
                }
                return offlineNotice();
            });
        });
    });
}

function offlineNotice() {
    return new Response(
        '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
        '<title>오프라인 · Science Virtual LAB</title>' +
        '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
        'background:#0f172a;color:#e8eef5;font-family:\'SeoulNamsan\',-apple-system,BlinkMacSystemFont,\'Noto Sans KR\',sans-serif;text-align:center;padding:24px}' +
        'h1{font-size:20px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:#9fb0c2;margin:0}' +
        'a{display:inline-block;margin-top:18px;padding:10px 18px;border-radius:999px;background:#2c3e50;color:#fff;text-decoration:none;font-weight:700}</style>' +
        '</head><body><div><h1>🛰️ 오프라인 상태입니다</h1>' +
        '<p>이 화면은 아직 저장되지 않았어요.<br>인터넷에 연결한 뒤 다시 열면 그때 저장되어 오프라인에서도 쓸 수 있습니다.</p>' +
        '<a href="/index.html">메인으로</a></div></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}
