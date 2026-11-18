/* ============================================================
   Science Virtual LAB — 오늘 실제 날씨 (공용 모듈)
   ------------------------------------------------------------
   · 1차 Open-Meteo 무료 API(키 불필요)로 오늘의 기온·해면기압·풍속·풍향·
     습도·낮/밤 여부를 가져온다.
   · 1차 서버가 막히거나 8초 안에 응답하지 않으면, 자동으로 2차 대체
     서버(wttr.in)에 다시 요청해 같은 값으로 실험에 반영한다.
     (wttr.in 응답의 WWO 날씨 코드·kmph·UTC 관측 시각을 변환해 쓴다)
   · 도시(서울·진주·부산·대구·광주·제주·강릉)를 고르거나 현재 위치를 쓴다.
   · 30분 동안 받은 값을 기억해 두고, 두 서버 모두 실패하면 원인별
     안내 문구로 폴백한다(위치 권한 / 네트워크 구분).

   쓰는 법 (실험 스크립트 안에서)
     <script src="../../common/live-weather.js"></script>
     SVLWeather.mount({
         panel: '#side-ctrl',          // 위젯을 붙일 패널(선택). 없으면 화면 우하단에 띄운다
         defaultCity: 'jinju',
         onApply: function (w) { ... } // w.temp, w.pressure, w.windSpeed, w.windDirText ...
     });
   ============================================================ */
(function (global) {
    'use strict';
    if (global.SVLWeather) return;

    var VERSION = '2026-11-18-fallback2';
    var CITIES = [
        { id: 'jinju', name: '진주', lat: 35.1800, lon: 128.0800 },
        { id: 'seoul', name: '서울', lat: 37.5665, lon: 126.9780 },
        { id: 'busan', name: '부산', lat: 35.1796, lon: 129.0756 },
        { id: 'daegu', name: '대구', lat: 35.8714, lon: 128.6014 },
        { id: 'gwangju', name: '광주', lat: 35.1595, lon: 126.8526 },
        { id: 'jeju', name: '제주', lat: 33.4996, lon: 126.5312 },
        { id: 'gangneung', name: '강릉', lat: 37.7519, lon: 128.8761 }
    ];
    var DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    /* 공용 다국어(i18n.js)가 있으면 현재 언어로 바꾼다. {0}{1}… 자리에 값을 채운다. */
    function T(k) {
        var args = [], i;
        for (i = 1; i < arguments.length; i++) args.push(arguments[i]);
        try {
            if (window.SVL_I18N && window.SVL_I18N.tr) return window.SVL_I18N.tr.apply(null, [k].concat(args));
        } catch (e) {}
        if (!args.length) return k;
        return String(k).replace(/\{(\d+)\}/g, function (m, n) { return args[+n] == null ? m : args[+n]; });
    }

    var CACHE_KEY = 'svl_live_weather_v1';
    var CACHE_MS = 30 * 60 * 1000;
    var TIMEOUT_MS = 8000;

    /* 원인별 안내 문구 */
    var MSG_GEO = '위치 권한이 허용되지 않았어요. 위 목록에서 도시(진주·서울 등)를 직접 고르거나 위치 권한을 켜 주세요.';
    var MSG_NET = '날씨 서버에 연결하지 못했어요. 학교 보안망이나 인터넷 연결을 확인한 뒤 다시 눌러 주세요. (지금은 기본 설정으로 실험합니다)';
    var MSG_WAIT = '🛰️ 오늘 날씨를 가져오는 중…';
    var MSG_RETRY = '🛰️ 날씨 서버 응답이 없어 대체 서버로 다시 시도하는 중…';

    function dirText(deg) {
        if (typeof deg !== 'number' || isNaN(deg)) return '—';
        return T(DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8] + '풍');
    }

    function skyText(code) {
        var t = '날씨 정보';
        if (code === 0) t = '맑음';
        else if (code === 1) t = '대체로 맑음';
        else if (code === 2) t = '구름 조금';
        else if (code === 3) t = '흐림';
        else if (code === 45 || code === 48) t = '안개';
        else if (code >= 51 && code <= 57) t = '이슬비';
        else if (code >= 61 && code <= 67) t = '비';
        else if (code >= 71 && code <= 77) t = '눈';
        else if (code >= 80 && code <= 82) t = '소나기';
        else if (code >= 85 && code <= 86) t = '눈 소나기';
        else if (code >= 95) t = '뇌우';
        return T(t);
    }

    /* 대체 서버(wttr.in)는 WMO가 아닌 WWO 날씨 코드를 쓴다 */
    function wwoSkyText(code) {
        var t = '날씨 정보';
        if (typeof code !== 'number' || isNaN(code)) return T(t);
        if (code === 113) t = '맑음';
        else if (code === 116) t = '구름 조금';
        else if (code === 119 || code === 122) t = '흐림';
        else if (code === 143 || code === 248 || code === 260) t = '안개';
        else if (code === 176 || code === 263 || code === 266 || code === 281 || code === 284 ||
            (code >= 293 && code <= 308) || code === 311 || code === 314) t = '비';
        else if (code >= 353 && code <= 359) t = '소나기';
        else if (code === 317 || code === 320 || code === 362 || code === 365) t = '진눈깨비';
        else if ((code >= 179 && code <= 185) || code === 227 || code === 230 ||
            (code >= 323 && code <= 338) || (code >= 371 && code <= 377)) t = '눈';
        else if (code === 350 || code === 374) t = '얼음 입자';
        else if (code === 200 || (code >= 386 && code <= 395)) t = '뇌우';
        return T(t);
    }

    /* wttr.in은 '12:10 AM' 같은 관측 시각 문자열을 준다.
       실측해 보니 한국 지점에서는 UTC 기준으로 오는 경우가 많아(예: 09:10 KST → '12:10 AM'),
       현지 시각으로 그대로 오는 서버도 있어서 지금 시각에 더 가까운 해석을 골라 표기한다. */
    function wttrTime(obs, now) {
        var base = now || new Date();
        var nowMin = base.getHours() * 60 + base.getMinutes();
        var m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(obs || ''));
        if (!m) return isoAt(base, nowMin);
        var obsMin = (parseInt(m[1], 10) % 12) * 60 + parseInt(m[2], 10);
        if (/PM/i.test(m[3])) obsMin += 720;
        function gap(a) { var d = ((a - nowMin) % 1440 + 1440) % 1440; return d > 720 ? 1440 - d : d; }
        var asUtc = obsMin + 9 * 60;   // UTC로 보고 한국 표준시(+9)로 환산
        var best = gap(asUtc) <= gap(obsMin) ? asUtc : obsMin;
        return isoAt(base, best);
    }

    /* 실패 원인을 구분해 담는 오류 객체: code 'geo'(위치) / 'net'(네트워크·차단·시간초과) */
    function netError(reason) {
        var e = new Error(reason || 'network');
        e.code = 'net';
        e.reason = reason || 'network';
        return e;
    }

    function geoError(reason) {
        var e = new Error(reason || 'geo');
        e.code = 'geo';
        e.reason = reason || 'geo';
        return e;
    }

    function toNetError(e) {
        if (e && e.code === 'net') return e;
        var reason = (e && e.name === 'AbortError') ? 'timeout' : ((e && e.message) || 'network');
        return netError(reason);
    }

    function buildUrl(lat, lon) {
        return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) +
            '&longitude=' + lon.toFixed(4) +
            '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m' +
            '&timezone=Asia%2FSeoul&wind_speed_unit=ms';
    }

    function buildWttrUrl(lat, lon) {
        return 'https://wttr.in/' + lat.toFixed(4) + ',' + lon.toFixed(4) + '?format=j1';
    }

    function timedFetch(url) {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
        var opts = { cache: 'no-store' };
        if (ctrl) opts.signal = ctrl.signal;
        function clear() {
            if (timer) { clearTimeout(timer); timer = null; }
        }
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw netError('http ' + r.status);
            return r.json();
        }).then(function (j) {
            clear();
            return j;
        }, function (e) {
            clear();
            throw toNetError(e);
        });
    }

    function parseOpenMeteo(j) {
        var c = j && j.current;
        if (!c || typeof c.temperature_2m !== 'number') throw netError('no data');
        return {
            temp: c.temperature_2m,
            feelsLike: c.apparent_temperature,
            humidity: c.relative_humidity_2m,
            pressure: c.pressure_msl,
            windSpeed: c.wind_speed_10m,
            windDir: c.wind_direction_10m,
            windDirText: dirText(c.wind_direction_10m),
            isDay: c.is_day === 1,
            precip: c.precipitation,
            code: c.weather_code,
            sky: skyText(c.weather_code),
            time: c.time,
            source: 'open-meteo'
        };
    }

    function parseWttr(j, now) {
        var cc = j && j.current_condition && j.current_condition[0];
        if (!cc || typeof num(cc.temp_C) !== 'number') throw netError('no data (wttr)');
        var kmph = num(cc.windspeedKmph);
        var dir = num(cc.winddirDegree);
        var code = num(cc.weatherCode);
        var d = now || new Date();
        return {
            temp: num(cc.temp_C),
            feelsLike: num(cc.FeelsLikeC),
            humidity: num(cc.humidity),
            pressure: num(cc.pressure),
            windSpeed: (kmph === null) ? null : kmph / 3.6,
            windDir: dir,
            windDirText: dirText(dir),
            isDay: d.getHours() >= 6 && d.getHours() < 18,
            precip: num(cc.precipMM),
            code: code,
            sky: wwoSkyText(code),
            time: wttrTime(cc.observation_time, d),
            source: 'wttr.in'
        };
    }

    function fetchOpenMeteo(lat, lon) {
        return timedFetch(buildUrl(lat, lon)).then(parseOpenMeteo);
    }

    function fetchWttr(lat, lon) {
        return timedFetch(buildWttrUrl(lat, lon)).then(function (j) { return parseWttr(j); });
    }

    /* 1차 Open-Meteo → 실패/시간초과(8초)면 2차 wttr.in 자동 재시도 */
    function fetchWeather(lat, lon, onRetry) {
        return fetchOpenMeteo(lat, lon).catch(function (primaryErr) {
            if (typeof onRetry === 'function') {
                try { onRetry(primaryErr); } catch (e) { }
            }
            return fetchWttr(lat, lon).then(function (w) {
                w.fallback = true;
                return w;
            }, function (backupErr) {
                var e = netError((primaryErr && primaryErr.reason) || 'network');
                e.primary = primaryErr && primaryErr.reason;
                e.backup = backupErr && backupErr.reason;
                throw e;
            });
        });
    }

    function readCache(id) {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var all = JSON.parse(raw) || {};
            var hit = all[id];
            if (!hit || !hit.at || (Date.now() - hit.at) > CACHE_MS) return null;
            return hit.data;
        } catch (e) { return null; }
    }

    function writeCache(id, data) {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            var all = raw ? (JSON.parse(raw) || {}) : {};
            all[id] = { at: Date.now(), data: data };
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
        } catch (e) { }
    }

    function summary(w, cityName) {
        return T('{0} {1}℃ · {2} hPa · {3} {4} m/s',
            T(cityName), fmt1(w.temp), fmt0(w.pressure), w.windDirText, fmt1(w.windSpeed));
    }

    function detail(w, cityName) {
        return summary(w, cityName) +
            T(' · 습도 {0}% · {1} · {2} 기준', fmt0(w.humidity), w.sky, hhmm(w.time));
    }

    var styleDone = false;
    function ensureStyle() {
        if (styleDone) return;
        styleDone = true;
        var st = document.createElement('style');
        st.textContent =
            '.lwv-block .lwv-btn{width:100%;padding:7px 8px;border-radius:10px;border:1px solid #0a84ff;' +
            'background:#0a84ff;color:#fff;font-family:inherit;font-size:11.5px;font-weight:900;line-height:1.25;' +
            'cursor:pointer;transition:filter .15s ease,transform .15s ease;-webkit-appearance:none;appearance:none}' +
            '.lwv-block .lwv-btn:hover{filter:brightness(1.06)}' +
            '.lwv-block .lwv-btn:active{transform:scale(.98)}' +
            '.lwv-block .lwv-btn:disabled{opacity:.62;cursor:default}' +
            '.lwv-block .lwv-city{font-family:inherit;font-size:11px;font-weight:800;border-radius:8px;' +
            'border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:3px 5px;max-width:104px}' +
            'body.dark-mode .lwv-block .lwv-city{background:#182434;color:#e2e8f0;border-color:rgba(255,255,255,.2)}' +
            '.lwv-block .lwv-status{display:block !important}' +
            '@media (max-width:520px){.lwv-block .lwv-btn{font-size:10.5px;padding:6px 7px}' +
            '.lwv-block .lwv-city{font-size:10px;max-width:92px}}';
        document.head.appendChild(st);
    }

    function mount(opts) {
        opts = opts || {};
        ensureStyle();
        var panel = typeof opts.panel === 'string' ? document.querySelector(opts.panel) : opts.panel;
        var popup = false;
        if (!panel) { panel = document.body; popup = true; }

        var wrap = document.createElement('div');
        wrap.className = 'lwv-block ctrl-block';
        wrap.innerHTML =
            '<div class="ctrl-row">' +
            '  <div class="ctrl-row-header"><span class="ctrl-label">' + T('🛰️ 오늘 실제 날씨') + '</span>' +
            '    <span class="ctrl-val lwv-city-wrap"></span></div>' +
            '  <button class="lwv-btn" type="button">' + T('🛰️ 오늘 실제 날씨 불러오기') + '</button>' +
            '  <div class="panel-note lwv-status">' + T('지역을 고르고 버튼을 누르면 오늘의 실제 기온·기압·바람이 실험에 반영됩니다.') + '</div>' +
            '</div>';

        var sel = document.createElement('select');
        sel.className = 'lwv-city';
        sel.setAttribute('aria-label', T('지역 선택'));
        var html = '';
        CITIES.forEach(function (c) { html += '<option value="' + c.id + '">' + T(c.name) + '</option>'; });
        html += '<option value="geo">' + T('📍 현재 위치') + '</option>';
        sel.innerHTML = html;
        sel.value = opts.defaultCity || 'jinju';
        wrap.querySelector('.lwv-city-wrap').appendChild(sel);

        if (popup) {
            wrap.style.cssText = 'position:fixed;right:10px;bottom:64px;z-index:850;max-width:230px;' +
                'padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.94);' +
                'box-shadow:0 8px 22px rgba(15,23,42,.18);';
            sel.style.cssText = 'font:inherit;font-size:10px;border-radius:8px;border:1px solid #cbd5e1;padding:2px 4px;';
        }
        if (popup) panel.appendChild(wrap);
        else panel.insertBefore(wrap, panel.firstChild);

        var btn = wrap.querySelector('.lwv-btn');
        var status = wrap.querySelector('.lwv-status');

        function setStatus(txt, color) {
            status.textContent = txt;
            status.style.color = color || '';
        }

        function locate() {
            return new Promise(function (resolve, reject) {
                if (!navigator.geolocation) return reject(geoError('no geo'));
                navigator.geolocation.getCurrentPosition(function (p) {
                    resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: T('현재 위치') });
                }, function (err) {
                    reject(geoError((err && err.code === 1) ? 'geo denied' : 'geo failed'));
                }, { timeout: 8000, maximumAge: 300000 });
            });
        }

        function run() {
            var id = sel.value;
            var cityName = T('현재 위치');
            var target;
            if (id === 'geo') {
                target = locate();
            } else {
                var c = CITIES.filter(function (x) { return x.id === id; })[0] || CITIES[0];
                cityName = c.name;
                target = Promise.resolve({ lat: c.lat, lon: c.lon, name: c.name });
            }

            btn.disabled = true;
            setStatus(MSG_WAIT, '');

            target.then(function (t) {
                cityName = t.name;
                var cached = readCache(id + '@' + t.lat.toFixed(2) + ',' + t.lon.toFixed(2));
                if (cached) return { data: cached, cached: true };
                return fetchWeather(t.lat, t.lon, function () {
                    setStatus(MSG_RETRY, '');
                }).then(function (d) {
                    writeCache(id + '@' + t.lat.toFixed(2) + ',' + t.lon.toFixed(2), d);
                    return { data: d, cached: false };
                });
            }).then(function (res) {
                var w = res.data;
                w.city = cityName;
                setStatus('🛰️ ' + summary(w, cityName) + ' · ' + w.sky);
                status.title = detail(w, cityName) + (res.cached ? T(' (30분 내 받은 값)') : '') +
                    (w.source ? ' · ' + w.source : '');
                btn.disabled = false;
                if (typeof opts.onApply === 'function') {
                    try { opts.onApply(w); } catch (e) { }
                }
            }).catch(function (e) {
                btn.disabled = false;
                if (e && e.code === 'geo') setStatus(MSG_GEO, '#dc2626');
                else setStatus(MSG_NET, '#dc2626');
            });
        }

        btn.addEventListener('click', run);
        return { run: run, element: wrap, select: sel };
    }

    global.SVLWeather = {
        version: VERSION,
        mount: mount,
        cities: CITIES,
        dirText: dirText,
        skyText: skyText,
        wwoSkyText: wwoSkyText,
        summary: summary
    };
})(window);
