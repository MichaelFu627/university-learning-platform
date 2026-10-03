import { all, one, setting } from './db';
import { mastery } from './learning';
import { aiConfigured, dailyLimit, usedToday } from './ai';
import { emailConfigured, syncReminders } from './reminders';
import type { Course, Document, Topic, Attempt, Snapshot, Assignment, Notice, Job } from './types';
export function snapshot(): Snapshot {
  syncReminders();
  const topics = all<Topic>(
    `SELECT t.*,c.name course_name,(SELECT count(*) FROM questions WHERE topic_id=t.id) question_count,(SELECT count(*) FROM questions WHERE topic_id=t.id AND status='approved') approved_count FROM topics t JOIN courses c ON c.id=t.course_id ORDER BY t.created_at DESC`,
  );
  const attempts = all<Attempt>(
    'SELECT a.*,q.difficulty FROM attempts a JOIN questions q ON q.id=a.question_id',
  );
  return {
    courses: all<Course>(
      `SELECT c.*,(SELECT count(*) FROM documents WHERE course_id=c.id) document_count,(SELECT count(*) FROM topics WHERE course_id=c.id) topic_count,(SELECT count(*) FROM assignments WHERE course_id=c.id AND completed=0) assignment_count FROM courses c ORDER BY created_at`,
    ),
    documents: all<Document>(
      'SELECT d.*,c.name course_name,(SELECT count(*) FROM chunks WHERE document_id=d.id) chunk_count FROM documents d JOIN courses c ON c.id=d.course_id ORDER BY created_at DESC',
    ),
    topics: topics.map((t) => ({
      ...t,
      mastery: mastery(attempts.filter((a) => a.topic_id === t.id)),
    })),
    assignments: all<Assignment>(
      'SELECT a.*,c.name course_name,c.color FROM assignments a JOIN courses c ON c.id=a.course_id ORDER BY due_at',
    ),
    notices: all<Notice>('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50'),
    jobs: all<Job>(
      'SELECT id,kind,target_id,status,error,created_at FROM jobs ORDER BY created_at DESC LIMIT 30',
    ),
    settings: {
      timezone: setting('timezone', process.env.APP_TIMEZONE || 'Australia/Melbourne'),
      dailyHours: Number(setting('dailyHours', '2')),
      aiConfigured: aiConfigured(),
      model: process.env.AI_MODEL || '',
      embeddingModel: process.env.EMBEDDING_MODEL || '',
      emailConfigured: emailConfigured(),
      workerLastSeen: setting('workerLastSeen') || null,
      aiDailyLimit: dailyLimit(),
      aiUsed: usedToday(),
    },
  };
}
export function requireExists(
  table: 'courses' | 'documents' | 'topics' | 'questions' | 'assignments',
  key: string,
) {
  if (!one(`SELECT id FROM ${table} WHERE id=?`, key))
    throw new Error('记录不存在，可能已被删除。');
}
