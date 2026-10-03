import { all, id, now, run, one } from './db';
import { DateTime } from 'luxon';
import type { Assignment } from './types';
import nodemailer from 'nodemailer';
export function reminderBucket(due: string, at = new Date()): string | null {
  const hours = (Date.parse(due) - at.getTime()) / 3600000;
  if (hours < 0) return 'overdue';
  if (hours <= 2) return '2h';
  if (hours <= 24) return '24h';
  if (hours <= 72) return '3d';
  if (hours <= 168) return '7d';
  return null;
}
export function syncReminders(at = new Date()) {
  const tasks = all<Assignment>(
    'SELECT a.*,c.name course_name FROM assignments a JOIN courses c ON c.id=a.course_id WHERE completed=0',
  );
  for (const a of tasks) {
    const bucket = reminderBucket(a.due_at, at);
    if (!bucket) continue;
    const title = bucket === 'overdue' ? `已逾期：${a.title}` : `即将截止：${a.title}`;
    const body = `${a.course_name} · ${DateTime.fromISO(a.due_at).setZone(a.timezone).toFormat('MM/dd HH:mm ZZZZ')} · 预计还需 ${a.hours} 小时`;
    run(
      'INSERT OR IGNORE INTO notifications(id,assignment_id,dedupe_key,title,body,created_at) VALUES(?,?,?,?,?,?)',
      id(),
      a.id,
      `${a.id}:${a.revision}:${bucket}`,
      title,
      body,
      at.toISOString(),
    );
  }
}
export const emailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.REMINDER_EMAIL);
export async function sendEmails() {
  if (!emailConfigured()) return;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  // Coalesce overdue/missed stages: only the newest pending notice for each assignment.
  const notices = all<{ id: string; assignment_id: string; title: string; body: string }>(
    "SELECT n.* FROM notifications n JOIN assignments a ON a.id=n.assignment_id WHERE n.email_status='pending' AND a.completed=0 ORDER BY n.created_at DESC LIMIT 20",
  );
  const seen = new Set<string>();
  for (const n of notices) {
    if (seen.has(n.assignment_id)) {
      run("UPDATE notifications SET email_status='superseded' WHERE id=?", n.id);
      continue;
    }
    seen.add(n.assignment_id);
    const claimed = run(
      "UPDATE notifications SET email_status='sending' WHERE id=? AND email_status='pending'",
      n.id,
    );
    if (!claimed.changes) continue;
    if (!one('SELECT id FROM assignments WHERE id=? AND completed=0', n.assignment_id)) continue;
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.REMINDER_EMAIL,
        subject: `[UniStudy] ${n.title}`,
        text: n.body,
        messageId: `<${n.id}@unistudy.local>`,
      });
      run("UPDATE notifications SET email_status='sent' WHERE id=?", n.id);
    } catch {
      run("UPDATE notifications SET email_status='failed' WHERE id=?", n.id);
    }
  }
  transport.close();
}
