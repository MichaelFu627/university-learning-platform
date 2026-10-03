import { id, now, run, transaction, one } from './db';
import { saveUpload } from './parser';
import { ingest } from './jobs';
export async function seedDemo() {
  if (one("SELECT id FROM courses WHERE code='DEMO101'"))
    throw new Error('示例课程已存在，可以直接打开。');
  const course = id(),
    doc = id(),
    topic = id();
  const text =
    '# 条件概率 · 示例课件\n\n这是一份用于体验功能的示例，不是你的真实课程。\n\n## 条件概率\n给定事件 B 已发生，A 发生的条件概率为 P(A|B)=P(A∩B)/P(B)，其中 P(B)>0。条件 B 将样本空间缩小到 B。\n\n## 独立与互斥\n独立意味着 P(A∩B)=P(A)P(B)。若 P(B)>0，则独立时 P(A|B)=P(A)。互斥意味着 A 和 B 不能同时发生，即 P(A∩B)=0。概率均大于零的互斥事件不独立。\n\n## 例题\n一副标准的 52 张扑克牌中，有 13 张红桃。已知抽到的是红色牌（26 张），抽到红桃的概率是 13/26=1/2。\n';
  await saveUpload(doc, 'md', Buffer.from(text));
  transaction(() => {
    run(
      'INSERT INTO courses VALUES(?,?,?,?,?,?)',
      course,
      '概率与统计 · 示例',
      'DEMO101',
      '#32695c',
      '体验课程',
      now(),
    );
    run(
      'INSERT INTO documents(id,course_id,name,extension,size,created_at) VALUES(?,?,?,?,?,?)',
      doc,
      course,
      '条件概率入门（示例）.md',
      'md',
      Buffer.byteLength(text),
      now(),
    );
    run(
      'INSERT INTO topics VALUES(?,?,?,?,?,?,?,?)',
      topic,
      course,
      doc,
      '条件概率',
      '能解释条件概率，完成计算，并区分独立与互斥。',
      1,
      'confirmed',
      now(),
    );
    const questions = [
      [
        '条件概率 P(A|B) 的正确计算公式是？',
        ['P(A∩B) / P(B)', 'P(A) / P(B)', 'P(B) / P(A)', 'P(A) + P(B)'],
        'A',
        '条件概率的分子为交集概率，分母为条件事件概率，且 P(B)>0。',
      ],
      [
        '“已知 B 发生”在条件概率中意味着什么？',
        ['A 一定发生', '只在 B 所包含的结果中计算比例', 'A 与 B 必须独立', 'A 与 B 必须互斥'],
        'B',
        '条件事件将考虑的样本空间限制到 B。',
      ],
      [
        '已知 P(A∩B)=0.12，P(B)=0.4，P(A|B) 是多少？',
        ['0.048', '0.52', '0.3', '0.28'],
        'C',
        '根据公式 0.12÷0.4=0.3。',
      ],
      [
        'A、B 概率都大于零且互斥。以下哪项正确？',
        ['它们一定独立', 'P(A|B)=P(A)', 'P(A∩B)=P(A)P(B)', '它们不独立'],
        'D',
        '互斥时交集概率为零，但两个正概率的乘积大于零，因此不独立。',
      ],
      [
        '从标准扑克牌中抽一张，已知它是红色牌，抽到红桃的概率为？',
        ['1/4', '1/2', '1/13', '13/52'],
        'B',
        '条件样本空间为 26 张红色牌，其中 13 张红桃，因此 13/26=1/2。',
      ],
    ];
    questions.forEach((q, i) =>
      run(
        'INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?)',
        id(),
        topic,
        i + 1,
        q[0] as string,
        JSON.stringify(q[1]),
        q[2] as string,
        q[3] as string,
        '单选题',
        'approved',
        1,
      ),
    );
    const due = new Date(Date.now() + 3 * 86400000);
    due.setUTCHours(12, 0, 0, 0);
    run(
      'INSERT INTO assignments(id,course_id,title,due_at,timezone,hours,weight,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      id(),
      course,
      '完成条件概率练习（示例）',
      due.toISOString(),
      'Australia/Melbourne',
      2,
      10,
      '可删除或修改，这是相对当前日期生成的体验任务。',
      now(),
    );
  });
  await ingest(doc);
  return { courseId: course };
}
