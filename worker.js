/* ============================================================================
   거지 라이프 — LLM 프록시 (Cloudflare Worker)
   목적: API 키를 서버(환경변수)에 숨기고 CORS를 붙여, GitHub Pages(github.io)의
        게임이 안전하게 무료 LLM(Groq)을 호출하게 한다.
   설계: 게임(rivals.js)이 쓰던 Ollama 경로/형식을 그대로 흉내낸다.
        - GET  /api/tags     → 헬스체크(게임의 pingOllama가 여길 본다) → 온라인 인식
        - POST /api/generate → { system?, prompt, options? } 받아 Groq 호출 후
                               { response } 로 반환 (Ollama /api/generate 응답 형식)
        따라서 rivals.js는 OLLAMA.url 한 줄만 이 Worker 주소로 바꾸면 된다.
   ========================================================================== */

// Groq 모델. 한국어를 더 살리고 싶으면 "qwen/qwen3-32b" 로 교체 가능.
const MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// 허용할 출처(당신의 GitHub Pages 도메인). 배포 후 실제 값으로 교체하세요.
// 로컬(file://)에서 테스트하면 Origin이 "null" 이므로 필요 시 "null" 을 추가.
const ALLOW_ORIGINS = [
  "https://USERNAME.github.io",
  // "null",                       // 로컬 file:// 테스트 시 주석 해제
];

function pickOrigin(origin) {
  return ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
}
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": pickOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    // 1) CORS 프리플라이트
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // 2) 헬스체크 — 게임의 pingOllama가 GET /api/tags 를 본다
    if (request.method === "GET" && (url.pathname === "/api/tags" || url.pathname === "/")) {
      return json({ status: "ok", models: [{ name: MODEL }] }, 200, cors);
    }

    // 3) 생성 — 게임의 llmLine / openNego 가 POST /api/generate 로 보낸다
    if (request.method === "POST" && url.pathname === "/api/generate") {
      if (!env.GROQ_API_KEY) return json({ error: "server: missing GROQ_API_KEY" }, 500, cors);

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "bad json" }, 400, cors); }

      const system = (body.system || "").toString().slice(0, 2000);
      const prompt = (body.prompt || "").toString().slice(0, 2000);
      if (!prompt) return json({ error: "empty prompt" }, 400, cors);

      const opts = body.options || {};
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      const payload = {
        model: MODEL,
        messages,
        temperature: typeof opts.temperature === "number" ? opts.temperature : 0.8,
        max_tokens: Math.min(200, opts.num_predict || 80),
      };

      let r;
      try {
        r = await fetch(GROQ_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + env.GROQ_API_KEY,
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        return json({ error: "upstream fetch failed" }, 502, cors);
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return json({ error: "upstream " + r.status, detail: t.slice(0, 300) }, 502, cors);
      }

      const data = await r.json().catch(() => null);
      const text = (data && data.choices && data.choices[0] &&
                    data.choices[0].message && data.choices[0].message.content || "").trim();

      // Ollama /api/generate 응답 형식을 흉내 → 게임 파싱(data.response)을 그대로 재사용
      return json({ response: text, model: MODEL }, 200, cors);
    }

    return json({ error: "not found" }, 404, cors);
  },
};