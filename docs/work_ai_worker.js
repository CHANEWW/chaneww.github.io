/* ============================================================================
   Science Virtual LAB — 업무 도구용 AI 중계 Worker (Cloudflare Workers)
   ----------------------------------------------------------------------------
   교사용「업무」 도구 3종(가정통신문 빌더 · 수업 동기유발 아이디어 뱅크 ·
   회의록 핵심 요약기)이 Google Gemini API 를 안전하게 부르도록 중계합니다.

   ■ 왜 Worker 를 거치나
     브라우저(HTML)에 API 키를 두면 누구나 볼 수 있습니다. 키는 Worker 의
     환경 변수에만 두고, 브라우저는 PIN 만 보내게 합니다. 업무 탭은 noindex +
     PIN 잠금이지만, 키 보호는 그와 별개로 지켜야 합니다.

   ■ 준비 (한 번만)
     1) https://dash.cloudflare.com → Workers & Pages → Create → Worker
     2) 아래 코드 전체를 붙여넣고 Deploy
     3) Settings → Variables and Secrets 에서 두 개를 추가 (Secret 권장)
          GEMINI_API_KEY = AI Studio(https://aistudio.google.com/apikey)에서 받은 키
          PIN_CODE       = 업무 탭에서 쓰는 4자리 PIN
        (선택) ALLOW_ORIGIN = https://chaneww.github.io
     4) Worker 주소(https://<이름>.<아이디>.workers.dev/)를
        각 도구의 ⚙️ AI Worker 에 저장

   ■ 요청 형식
     GET  /?ping=1                     → { ok:true, service:'svl-work-ai' }
     POST /  headers: X-Pin: <PIN>
             body: { tool, lang, system, prompt }
             → { ok:true, text:'...' }  또는  { ok:false, error:'...' }

   ■ 주의
     · PIN 이 틀리면 401, PIN_CODE 가 비어 있으면 503(설정 오류)을 돌려줍니다.
     · 응답은 짧은 텍스트(마크다운 축약형)만 쓰므로 maxOutputTokens 를 제한합니다.
   ========================================================================== */

const MODEL = 'gemini-2.5-flash';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

function cors(env, extra) {
  const allow = (env && env.ALLOW_ORIGIN) || 'https://chaneww.github.io';
  return Object.assign({
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Pin',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  }, extra || {});
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: cors(env, { 'Content-Type': 'application/json; charset=utf-8' })
  });
}

/* PIN 비교 — 길이가 달라도 시간 차이가 크지 않게 */
function samePin(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function buildPrompt(system, prompt, lang) {
  const langName = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese', es: 'Spanish' }[lang] || 'Korean';
  return [
    system || '',
    'Answer in ' + langName + '.',
    'Output plain text only, using this compact markdown: "# title", "## section", "- bullet", "| a | b |" tables.',
    'Never invent personal data, phone numbers, amounts or dates that the user did not give.',
    '',
    '--- 요청 ---',
    prompt || ''
  ].join('\n').trim();
}

async function callGemini(env, system, prompt, lang) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(system, prompt, lang) }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 }
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    })
  });

  const raw = await res.text();
  if (!res.ok) {
    let msg = 'Gemini HTTP ' + res.status;
    try { const j = JSON.parse(raw); msg += ': ' + ((j.error && j.error.message) || raw).slice(0, 200); } catch (e) {}
    throw new Error(msg);
  }

  let data = null;
  try { data = JSON.parse(raw); } catch (e) { throw new Error('Gemini 응답을 읽지 못했습니다.'); }
  const cand = (data.candidates && data.candidates[0]) || null;
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.map(function (p) { return p.text || ''; }).join('').trim();
  if (!text) {
    const why = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'EMPTY';
    throw new Error('결과가 비어 있습니다 (' + why + ')');
  }
  return text;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    /* 연결 확인 — PIN 없이도 살아 있는지만 알려 준다 */
    if (request.method === 'GET' && url.searchParams.get('ping')) {
      return json({ ok: true, service: 'svl-work-ai', model: MODEL, pin: samePin(request.headers.get('X-Pin'), env.PIN_CODE) }, 200, env);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, env);
    }

    if (!env.GEMINI_API_KEY) return json({ ok: false, error: 'GEMINI_API_KEY 가 설정되지 않았습니다.' }, 503, env);
    if (!env.PIN_CODE) return json({ ok: false, error: 'PIN_CODE 가 설정되지 않았습니다.' }, 503, env);
    if (!samePin(request.headers.get('X-Pin'), env.PIN_CODE)) {
      return json({ ok: false, error: 'pin_mismatch' }, 401, env);
    }

    let body = null;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json' }, 400, env); }

    const tool = String((body && body.tool) || 'tool').slice(0, 40);
    const lang = String((body && body.lang) || 'ko').slice(0, 5);
    const system = String((body && body.system) || '').slice(0, 2000);
    const prompt = String((body && body.prompt) || '').slice(0, 12000);
    if (!prompt.trim()) return json({ ok: false, error: 'empty_prompt' }, 400, env);

    try {
      const text = await callGemini(env, system, prompt, lang);
      return json({ ok: true, text: text, tool: tool, model: MODEL }, 200, env);
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 502, env);
    }
  }
};
