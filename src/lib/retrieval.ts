import { all } from './db';
import { embed } from './ai';
import type { Chunk } from './types';
const stop = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'is',
  'and',
  'what',
  'how',
  'does',
  'for',
  'with',
  'this',
  'that',
  'are',
]);
export function tokens(text: string) {
  const words = text.toLowerCase().match(/[a-z0-9_]{2,}|[\p{Script=Han}]+/gu) || [];
  return words.flatMap((w) =>
    /\p{Script=Han}/u.test(w)
      ? w.length === 1
        ? [w]
        : Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))
      : stop.has(w)
        ? []
        : [w],
  );
}
export function lexical(query: string, chunks: Chunk[]) {
  const ts = [...new Set(tokens(query))];
  const indexed = chunks.map((c) => {
    const list = tokens(c.content);
    return { c, length: list.length, set: new Set(list) };
  });
  const weights = new Map(
    ts.map((t) => [
      t,
      Math.log(1 + chunks.length / (1 + indexed.filter((x) => x.set.has(t)).length)),
    ]),
  );
  return indexed
    .map(({ c, length, set }) => {
      const score =
        ts.reduce((s, t) => s + (set.has(t) ? weights.get(t)! : 0), 0) /
        Math.sqrt(Math.max(1, length / 100));
      return { chunk: c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0) * b.reduce((s, x) => s + x * x, 0));
  return norm ? a.reduce((s, x, i) => s + x * b[i], 0) / norm : 0;
}
export async function retrieve(courseId: string, query: string) {
  const chunks = all<Chunk>(
    'SELECT c.*,d.name document_name FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.course_id=? ORDER BY d.created_at,c.page',
    courseId,
  );
  const keyword = lexical(query, chunks).slice(0, 30);
  const rank = new Map(
    keyword.map((x, i) => [x.chunk.id, { chunk: x.chunk, score: 1 / (60 + i + 1) }]),
  );
  let mode = 'keyword';
  if (
    process.env.EMBEDDING_MODEL &&
    chunks.some((c) => c.embedding && c.embedding_model === process.env.EMBEDDING_MODEL)
  ) {
    const [q] = await embed([query]);
    if (q) {
      const semantic = chunks
        .filter((c) => c.embedding && c.embedding_model === process.env.EMBEDDING_MODEL)
        .map((c) => ({ chunk: c, score: cosine(q, JSON.parse(c.embedding!)) }))
        .filter((x) => x.score > 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
      semantic.forEach((x, i) => {
        const old = rank.get(x.chunk.id);
        rank.set(x.chunk.id, { chunk: x.chunk, score: (old?.score || 0) + 1 / (60 + i + 1) });
      });
      mode = 'hybrid';
    }
  }
  return {
    chunks: [...rank.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.chunk),
    mode,
  };
}
