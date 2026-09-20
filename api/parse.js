// AX Discovery Agent — 자유입력 LLM 파싱 프록시 (Vercel Serverless Function)
// 브라우저는 /api/parse 로만 호출하고, Anthropic API 키는 서버 환경변수(ANTHROPIC_API_KEY)에만 둔다.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_PROMPT = 20000; // 프롬프트에 고민 코드 목록이 포함되므로 넉넉히

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  // 같은 사이트에서 온 요청만 허용 (다른 사이트가 이 프록시를 가져다 쓰는 것을 막는다)
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && host && !origin.includes(host)) { res.status(403).json({ error: 'forbidden' }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const prompt = body && typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt || prompt.length > MAX_PROMPT) { res.status(400).json({ error: 'bad prompt' }); return; }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: 'upstream ' + r.status, detail: data && data.error && data.error.message }); return; }
    const txt = (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
    let parsed;
    try { parsed = JSON.parse(txt.replace(/```json|```/g, '').trim()); }
    catch { res.status(502).json({ error: 'non-json', raw: txt.slice(0, 500) }); return; }
    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
}
