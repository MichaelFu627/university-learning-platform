import { id, now, one, run, transaction } from './db';
export const aiConfigured = () => Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
export function dailyLimit() {
  const n = Number(process.env.AI_DAILY_LIMIT || 100);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
}
export function usedToday() {
  return (
    one<{ n: number }>('SELECT count(*) n FROM ai_usage WHERE day=?', now().slice(0, 10))?.n || 0
  );
}
function reserve(kind: string) {
  transaction(() => {
    if (usedToday() >= dailyLimit())
      throw new Error('已达到今日 AI 调用限额（UTC 日期），请明天再试或修改 AI_DAILY_LIMIT。');
    run('INSERT INTO ai_usage VALUES(?,?,?,?)', id(), now().slice(0, 10), kind, now());
  });
}
async function request(endpoint: string, body: unknown) {
  const base = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const u = new URL(base);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
    throw new Error('远程 AI 服务必须使用 HTTPS。');
  reserve(endpoint);
  const res = await fetch(`${base.replace(/\/$/, '')}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`AI 服务返回 ${res.status}，请检查模型名称、额度和连接配置。`);
  return res.json();
}
export async function chat(system: string, user: string): Promise<string> {
  if (!aiConfigured())
    throw new Error('尚未配置 AI。请在 .env.local 填写 AI_API_KEY 和 AI_MODEL 后重启。');
  const result = await request('chat/completions', {
    model: process.env.AI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: 4000,
  });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim())
    throw new Error('模型没有返回有效文本，请换用支持文本输出的模型。');
  return content;
}
export function parseJSON(content: string): unknown {
  const clean = content.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('模型输出格式不完整，本次结果未保存，可重试。');
  }
}
export async function embed(texts: string[]): Promise<number[][]> {
  if (!process.env.EMBEDDING_MODEL || !process.env.AI_API_KEY) return [];
  const result = await request('embeddings', {
    model: process.env.EMBEDDING_MODEL,
    input: texts,
    encoding_format: 'float',
  });
  const data = result.data?.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  if (!Array.isArray(data) || data.length !== texts.length)
    throw new Error('向量服务返回数量不匹配。');
  return data.map((row: { embedding: number[] }) => {
    if (
      !Array.isArray(row.embedding) ||
      !row.embedding.length ||
      !row.embedding.every(Number.isFinite)
    )
      throw new Error('向量格式无效。');
    return row.embedding;
  });
}
