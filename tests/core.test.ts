import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import AdmZip from 'adm-zip';
import { mastery, localToUTC, weekPlan } from '../src/lib/learning';
import type { Attempt, Assignment, Chunk } from '../src/lib/types';
const folder = mkdtempSync(path.join(tmpdir(), 'unistudy-test-'));
process.env.DATA_DIR = folder;
delete process.env.AI_API_KEY;
delete process.env.AI_MODEL;
delete process.env.EMBEDDING_MODEL;
delete process.env.SOFFICE_PATH;
const { db, run, one, all, id, now, enqueue } = await import('../src/lib/db');
const { saveUpload, officePages, splitPages } = await import('../src/lib/parser');
const { ingest, processNextJob } = await import('../src/lib/jobs');
const { lexical, retrieve } = await import('../src/lib/retrieval');
const { syncReminders, reminderBucket } = await import('../src/lib/reminders');
const { chat, parseJSON } = await import('../src/lib/ai');
const { seedDemo } = await import('../src/lib/demo');
after(() => {
  db().close();
  rmSync(folder, { recursive: true, force: true });
});
function attempt(n: number, score = 1, opts: Partial<Attempt> = {}): Attempt {
  return {
    id: String(n),
    question_id: String(n),
    topic_id: 'topic',
    answer: 'A',
    score,
    feedback: '',
    hinted: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    difficulty: (n % 5) + 1,
    ...opts,
  };
}
test('mastery needs independent evidence, and hinted/repeated answers cannot inflate it', () => {
  assert.equal(mastery([]).score, null);
  assert.equal(mastery([attempt(0)]).status, 'unassessed');
  assert.equal(
    mastery([attempt(0, 0), attempt(0, 1, { created_at: '2026-10-02T00:00:00.000Z' })]).score,
    0,
  );
  assert.equal(mastery([attempt(0, 1, { hinted: 1 })]).count, 0);
  assert.equal(
    mastery(Array.from({ length: 5 }, (_, n) => attempt(n, n < 2 ? 1 : 0))).status,
    'review',
  );
  assert.equal(mastery(Array.from({ length: 5 }, (_, n) => attempt(n))).status, 'provisional');
  assert.equal(
    mastery([
      ...Array.from({ length: 5 }, (_, n) => attempt(n)),
      attempt(8, 1, { created_at: '2026-10-03T00:00:00.000Z' }),
    ]).status,
    'secure',
  );
});
test('Melbourne timezone conversion respects daylight savings and rejects ambiguous local times', () => {
  assert.equal(localToUTC('2026-10-03T23:00', 'Australia/Melbourne'), '2026-10-03T13:00:00.000Z');
  assert.equal(localToUTC('2026-10-04T23:00', 'Australia/Melbourne'), '2026-10-04T12:00:00.000Z');
  assert.throws(() => localToUTC('2026-10-04T02:30', 'Australia/Melbourne'));
  assert.throws(() => localToUTC('2026-04-05T02:30', 'Australia/Melbourne'));
  assert.throws(() => localToUTC('2026-10-03T12:00', 'Not/AZone'));
});
test('workload plan exposes infeasible deadlines rather than silently exceeding daily capacity', () => {
  const at = new Date('2026-10-01T00:00:00Z');
  const tasks = [
    {
      id: 'a',
      title: 'A',
      course_name: 'C',
      hours: 10,
      due_at: '2026-10-01T12:00:00Z',
      completed: 0,
    },
  ] as Assignment[];
  const plan = weekPlan(tasks, 2, 'UTC', at);
  assert.equal(plan.unscheduled, 8);
  assert.equal(plan.days[0].hours, 2);
  assert.equal(weekPlan([{ ...tasks[0], completed: 1 }], 2, 'UTC', at).demand, 0);
});
test('text chunks retain page locations, and Chinese terms can be retrieved', () => {
  assert.equal(splitPages([{ page: 7, text: 'a'.repeat(2500) }]).length, 3);
  const chunks = [
    { id: '1', content: '条件概率在事件已经发生的条件下计算概率。', page: 1 },
    { id: '2', content: 'Binary trees have left and right subtrees.', page: 2 },
  ] as Chunk[];
  assert.equal(lexical('条件概率', chunks)[0].chunk.id, '1');
  assert.equal(lexical('subtrees', chunks)[0].chunk.id, '2');
  assert.equal(lexical('volcano', chunks).length, 0);
});
let courseId = '';
let docId = '';
test('document ingestion persists chunks and isolates retrieval by course', async () => {
  courseId = id();
  docId = id();
  run('INSERT INTO courses VALUES(?,?,?,?,?,?)', courseId, 'Test', 'TST', '#32695c', '', now());
  const text =
    'Conditional probability is P(A intersect B) divided by P(B). 条件概率是已知事件发生后计算的概率。';
  await saveUpload(docId, 'md', Buffer.from(text));
  run(
    'INSERT INTO documents(id,course_id,name,extension,size,created_at) VALUES(?,?,?,?,?,?)',
    docId,
    courseId,
    'lecture.md',
    'md',
    text.length,
    now(),
  );
  await ingest(docId);
  assert.equal(
    one<{ status: string }>('SELECT status FROM documents WHERE id=?', docId)?.status,
    'ready',
  );
  assert.equal((await retrieve(courseId, 'conditional probability')).chunks.length, 1);
  assert.equal((await retrieve(id(), 'conditional probability')).chunks.length, 0);
  await ingest(docId);
  assert.equal(
    one<{ n: number }>('SELECT count(*) n FROM chunks WHERE document_id=?', docId)?.n,
    1,
  );
});
test('PPTX native text parsing uses numeric slide order and preserves provenance', async () => {
  const zip = new AdmZip();
  zip.addFile(
    'ppt/slides/slide10.xml',
    Buffer.from('<p:sld><a:t>Slide ten example text</a:t></p:sld>'),
  );
  zip.addFile(
    'ppt/slides/slide2.xml',
    Buffer.from('<p:sld><a:t>Slide two example text</a:t></p:sld>'),
  );
  const uid = id();
  await saveUpload(uid, 'pptx', zip.toBuffer());
  const pages = await officePages(path.join(folder, 'uploads', `${uid}.pptx`), 'pptx');
  assert.match(pages[0].text, /two/);
  assert.match(pages[1].text, /ten/);
});
test('real text PDF can be parsed and indexed without an AI key', async () => {
  const stream = 'BT /F1 16 Tf 50 700 Td (Probability and learning) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const uid = id();
  await saveUpload(uid, 'pdf', Buffer.from(pdf));
  run(
    'INSERT INTO documents(id,course_id,name,extension,size,created_at) VALUES(?,?,?,?,?,?)',
    uid,
    courseId,
    'test.pdf',
    'pdf',
    pdf.length,
    now(),
  );
  await ingest(uid);
  assert.match(
    one<{ content: string }>('SELECT content FROM chunks WHERE document_id=?', uid)!.content,
    /Probability and learning/,
  );
});
test('reminders catch missed stages once, and completed assignments produce none', () => {
  const at = new Date('2026-10-03T00:00:00Z');
  const aid = id();
  run(
    'INSERT INTO assignments(id,course_id,title,due_at,timezone,created_at) VALUES(?,?,?,?,?,?)',
    aid,
    courseId,
    'Due soon',
    '2026-10-03T01:00:00Z',
    'UTC',
    now(),
  );
  syncReminders(at);
  syncReminders(at);
  assert.equal(
    one<{ n: number }>('SELECT count(*) n FROM notifications WHERE assignment_id=?', aid)?.n,
    1,
  );
  assert.equal(reminderBucket('2026-10-03T01:00:00Z', at), '2h');
  run('UPDATE assignments SET completed=1 WHERE id=?', aid);
  syncReminders(new Date('2026-10-04T00:00:00Z'));
  assert.equal(
    one<{ n: number }>('SELECT count(*) n FROM notifications WHERE assignment_id=?', aid)?.n,
    1,
  );
});
test('durable queue deduplicates pending jobs and recovers expired leases', async () => {
  const jid = enqueue('ingest', docId);
  assert.equal(enqueue('ingest', docId), jid);
  run(
    "UPDATE jobs SET status='running',lease_until='2000-01-01T00:00:00Z',attempts=1 WHERE id=?",
    jid,
  );
  await processNextJob();
  assert.equal(one<{ status: string }>('SELECT status FROM jobs WHERE id=?', jid)?.status, 'done');
});
test('AI adapter, semantic retrieval and generated question validation work against a local contract server', async () => {
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/embeddings') {
      res.end(
        JSON.stringify({
          data: body.input.map((_: string, index: number) => ({ index, embedding: [1, 0, 0] })),
        }),
      );
      return;
    }
    const system = body.messages[0].content as string;
    const content = system.includes('知识点整理')
      ? JSON.stringify({
          topics: [
            {
              title: 'Conditional probability',
              description: 'Explain and calculate conditional probability.',
              page: 1,
            },
          ],
        })
      : system.includes('出题助手')
        ? JSON.stringify({
            questions: Array.from({ length: 5 }, (_, i) => ({
              difficulty: i + 1,
              prompt: `Sample valid probability question number ${i + 1}?`,
              options: ['One', 'Two', 'Three', 'Four'],
              answer: 'A',
              explanation: 'The source supports option A.',
            })),
          })
        : 'Grounded answer [1]';
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  process.env.AI_BASE_URL = `http://127.0.0.1:${addr.port}/v1`;
  process.env.AI_API_KEY = 'test-placeholder';
  process.env.AI_MODEL = 'contract-model';
  process.env.EMBEDDING_MODEL = 'contract-embedding';
  try {
    assert.equal(await chat('help', 'question'), 'Grounded answer [1]');
    assert.throws(() => parseJSON('not JSON'));
    await ingest(docId);
    assert.equal((await retrieve(courseId, 'probability')).mode, 'hybrid');
    enqueue('discover', docId);
    await processNextJob();
    const topic = one<{ id: string }>('SELECT id FROM topics WHERE document_id=?', docId)!;
    assert.ok(topic);
    run("UPDATE topics SET status='confirmed' WHERE id=?", topic.id);
    enqueue('questions', topic.id);
    await processNextJob();
    assert.equal(all('SELECT id FROM questions WHERE topic_id=?', topic.id).length, 5);
    assert.equal(
      all("SELECT id FROM questions WHERE topic_id=? AND status='approved'", topic.id).length,
      0,
    );
    process.env.AI_DAILY_LIMIT = '1';
    await assert.rejects(chat('help', 'question'), /限额/);
  } finally {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.AI_DAILY_LIMIT;
    delete process.env.AI_BASE_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('demo creates a usable course and five approved questions, and prevents duplicate seeds', async () => {
  await seedDemo();
  const course = one<{ id: string }>("SELECT id FROM courses WHERE code='DEMO101'")!;
  assert.equal(
    all(
      'SELECT q.id FROM questions q JOIN topics t ON t.id=q.topic_id WHERE t.course_id=?',
      course.id,
    ).length,
    5,
  );
  await assert.rejects(seedDemo(), /已存在/);
});
test('deleting a course cascades to chunks, attempts, topics and assignments', () => {
  run('DELETE FROM courses WHERE id=?', courseId);
  assert.equal(all('SELECT * FROM chunks WHERE course_id=?', courseId).length, 0);
  assert.equal(all('SELECT * FROM topics WHERE course_id=?', courseId).length, 0);
  assert.equal(all('SELECT * FROM assignments WHERE course_id=?', courseId).length, 0);
});
