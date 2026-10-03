import type { Attempt, Mastery, Assignment } from './types';
import { DateTime } from 'luxon';
export function mastery(attempts: Attempt[], at = new Date()): Mastery {
  // First unaided answer per distinct question: repeating a memorized answer cannot inflate mastery.
  const first = new Map<string, Attempt>();
  [...attempts]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((a) => {
      if (!a.hinted && !first.has(a.question_id)) first.set(a.question_id, a);
    });
  const evidence = [...first.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);
  if (!evidence.length)
    return {
      score: null,
      count: 0,
      status: 'unassessed',
      label: '尚未评估',
      due: false,
      nextReview: null,
    };
  const score = Math.round((evidence.reduce((s, a) => s + a.score, 0) / evidence.length) * 100);
  const application = evidence.filter((a) => a.difficulty >= 3);
  const levels = new Set(evidence.map((a) => a.difficulty));
  let status: Mastery['status'] = 'unassessed';
  if (evidence.length >= 5 && levels.size >= 3 && application.length >= 2) {
    status = score < 60 ? 'review' : score < 80 ? 'developing' : 'provisional';
    const earliest = Math.min(...evidence.map((a) => Date.parse(a.created_at)));
    const laterPass = application.some(
      (a) => a.score >= 0.8 && Date.parse(a.created_at) - earliest >= 86400000,
    );
    if (status === 'provisional' && laterPass && application.every((a) => a.score >= 0.6))
      status = 'secure';
  }
  const days = status === 'review' ? 1 : status === 'developing' ? 3 : status === 'secure' ? 14 : 7;
  const nextReview = new Date(Date.parse(evidence[0].created_at) + days * 86400000).toISOString();
  const labels = {
    unassessed: '证据不足',
    review: '需要复习',
    developing: '待巩固',
    provisional: '初步掌握',
    secure: '较稳固',
  };
  return {
    score,
    count: evidence.length,
    status,
    label: labels[status],
    nextReview,
    due: Date.parse(nextReview) <= at.getTime(),
  };
}
export function localToUTC(local: string, zone: string) {
  const value = DateTime.fromISO(local, { zone });
  if (!value.isValid || value.toFormat("yyyy-MM-dd'T'HH:mm") !== local)
    throw new Error('日期或时区无效；请检查夏令时切换时段。');
  if (value.getPossibleOffsets().length > 1)
    throw new Error('此时间位于夏令时重复时段，请选择无歧义时间。');
  return value.toUTC().toISO()!;
}
export function weekPlan(
  assignments: Assignment[],
  dailyHours: number,
  zone: string,
  at = new Date(),
) {
  const start = DateTime.fromJSDate(at).setZone(zone).startOf('day');
  const end = start.plus({ days: 7 });
  const pending = assignments
    .filter((a) => !a.completed && Date.parse(a.due_at) < end.toMillis())
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const demand = pending.reduce((s, a) => s + a.hours, 0);
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: start.plus({ days: i }).toISODate()!,
    hours: 0,
    tasks: [] as { title: string; course: string; hours: number }[],
  }));
  let unscheduled = 0;
  for (const a of pending) {
    let remaining = a.hours;
    const dueDay = DateTime.fromISO(a.due_at).setZone(zone).toISODate()!;
    for (const day of days) {
      if (day.date > dueDay || Date.parse(a.due_at) <= at.getTime()) break;
      const slot = Math.min(remaining, Math.max(0, dailyHours - day.hours));
      if (slot > 0) {
        day.tasks.push({ title: a.title, course: a.course_name || '', hours: slot });
        day.hours += slot;
        remaining -= slot;
      }
      if (remaining <= 0) break;
    }
    unscheduled += remaining;
  }
  return { days, demand, capacity: dailyHours * 7, unscheduled };
}
