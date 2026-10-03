import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
const { processNextJob } = await import('../src/lib/jobs');
const { syncReminders, sendEmails } = await import('../src/lib/reminders');
const { setSetting, now } = await import('../src/lib/db');
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
console.log('UniStudy worker ready: document jobs and deadline reminders.');
let notifying = false;
const notify = async () => {
  if (notifying) return;
  notifying = true;
  try {
    syncReminders();
    await sendEmails();
  } catch (e) {
    console.error('Reminder check failed:', e instanceof Error ? e.message : 'unknown');
  } finally {
    notifying = false;
  }
};
void notify();
const reminders = setInterval(() => void notify(), 30000);
while (!stopping) {
  try {
    setSetting('workerLastSeen', now());
    if (!(await processNextJob())) await new Promise((r) => setTimeout(r, 1000));
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Worker error');
    await new Promise((r) => setTimeout(r, 3000));
  }
}
clearInterval(reminders);
console.log('Worker stopped. Queued jobs remain on disk.');
