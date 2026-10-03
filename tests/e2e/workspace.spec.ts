import { test, expect } from '@playwright/test';
test('single-user learning workflow: seed, files, retrieval, grading, deadlines, persistence and mobile', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '把学习，安排得从容一点。' })).toBeVisible();
  await page.getByRole('button', { name: '载入示例', exact: true }).click();
  await expect(page.locator('.course-card')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '新建课程', exact: true }).click();
  await page.getByLabel('课程名称').fill('Algorithms');
  await page.getByLabel('课程代码').fill('COMP20003');
  await page.getByLabel('学期').fill('2026 Semester 2');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.course-card')).toHaveCount(2);
  await page.locator('.course-card').filter({ hasText: 'Algorithms' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'lecture.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# Binary search\nBinary search divides a sorted array in half at each step. Its time complexity is O(log n).',
      ),
    });
  await expect(
    page
      .locator('.file-row')
      .filter({ hasText: 'lecture.md' })
      .getByText('已入库', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /lecture.md.*KB/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Binary search');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '课程问答', exact: true }).click();
  await page.getByRole('textbox', { name: '课程问题' }).fill('binary search');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.locator('.message.assistant')).toContainText('O(log n)');
  await expect(page.locator('.citations button')).toHaveCount(1);
  await page.getByRole('button', { name: '学习日历', exact: true }).click();
  await page.getByRole('button', { name: '添加作业', exact: true }).click();
  await page.getByLabel('作业 / 考试名称').fill('Project 1');
  await page.getByLabel('截止日期和时间').fill('2026-12-10T23:59');
  await page.getByLabel('预计剩余小时').fill('6');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.deadline-list')).toContainText('Project 1');
  await page.getByRole('button', { name: '完成 Project 1', exact: true }).click();
  await expect(page.locator('.deadline-list')).toContainText('已完成');
  await page.getByLabel('筛选课程').selectOption({ label: '全部课程' });
  await page.getByRole('button', { name: '知识点练习', exact: true }).click();
  await expect(page.locator('.question-panel h3')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.locator('.answer-options button').nth(0).click();
    await page.getByRole('button', { name: '提交答案', exact: true }).click();
    await expect(page.locator('.feedback')).toBeVisible();
    if (i < 4) await page.getByRole('button', { name: '下一题', exact: true }).click();
  }
  await expect(page.locator('.topic-detail')).toContainText('需要复习');
  await expect(page.locator('.topic-detail')).toContainText('5 道独立有效题');
  await page.screenshot({ path: 'test-results/practice-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.course-card')).toHaveCount(2);
  await page.getByRole('button', { name: '查看提醒', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('button', { name: '学习日历', exact: true }).click();
  await expect(page.locator('.calendar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect
    .poll(
      async () => await page.locator('.sidebar').evaluate((e) => e.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: 'test-results/calendar-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  const rejected = await request.post('/api/courses', {
    headers: { Origin: 'https://example.invalid' },
    data: { name: 'Cross site' },
  });
  expect(rejected.status()).toBe(400);
  expect(errors).toEqual([]);
});
test('API workflows validate nested actions, keep answer keys server-side, and clean up deleted data', async ({
  request,
}) => {
  const c = await request.post('/api/courses', { data: { name: 'Integration course' } });
  expect(c.ok()).toBeTruthy();
  const courseId = (await c.json()).id;
  const uploaded = await request.post('/api/documents', {
    multipart: {
      course_id: courseId,
      file: {
        name: 'integration.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(
          'Integration testing confirms that software components work together correctly.',
        ),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const docId = (await uploaded.json()).id;
  await expect
    .poll(
      async () => {
        const s = await (await request.get('/api/state')).json();
        return s.documents.find((d: { id: string }) => d.id === docId)?.status;
      },
      { timeout: 20000 },
    )
    .toBe('ready');
  expect((await request.post(`/api/documents/${docId}/reindex`, { data: {} })).ok()).toBeTruthy();
  const noAI = await request.post(`/api/documents/${docId}/discover`, { data: {} });
  expect((await noAI.json()).error).toContain('配置 AI');
  const t = await request.post('/api/topics', {
    data: {
      document_id: docId,
      title: 'Integration testing',
      description: 'Explain the purpose',
      source_page: 1,
    },
  });
  expect(t.ok()).toBeTruthy();
  const tid = (await t.json()).id;
  const generated = await request.post(`/api/topics/${tid}/generate`, { data: {} });
  expect((await generated.json()).error).toContain('配置 AI');
  const q = await request.post('/api/questions', {
    data: {
      topic_id: tid,
      difficulty: 1,
      prompt: 'What is tested?',
      options: ['Components together', 'Only colors', 'Only users', 'Nothing'],
      answer: 'A',
      explanation: 'Integration concerns how components work together.',
    },
  });
  expect(q.ok()).toBeTruthy();
  const qid = (await q.json()).id;
  const questions = await (await request.get(`/api/topics/${tid}/questions`)).json();
  expect(questions[0].answer).toBeUndefined();
  const grade = await request.post(`/api/questions/${qid}/answer`, {
    data: { answer: 'A', hinted: false },
  });
  expect(grade.ok()).toBeTruthy();
  expect((await grade.json()).score).toBe(1);
  const invalid = await request.post('/api/assignments', {
    data: {
      course_id: courseId,
      title: 'DST gap',
      due_local: '2026-10-04T02:30',
      timezone: 'Australia/Melbourne',
      hours: 2,
    },
  });
  expect(invalid.status()).toBe(400);
  expect((await request.delete(`/api/courses/${courseId}`)).ok()).toBeTruthy();
  expect((await request.get(`/api/documents/${docId}/content`)).status()).toBe(404);
});
