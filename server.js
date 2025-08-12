import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import webpush from 'web-push';
import schedule from 'node-schedule';
import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 3000;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.warn('VAPID keys not found in .env. Run `node vapid-keys.js` to generate and add them to .env');
}

// Configure web-push
webpush.setVapidDetails(
  'mailto:example@example.com',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

// Setup lowdb
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data = db.data || { tasks: [], subscriptions: [] };
  await db.write();
}

// Helper: schedule job for a task
const scheduledJobs = new Map();

function scheduleTask(task) {
  // task: { id, title, message, time }
  try {
    const runDate = new Date(task.time);
    if (isNaN(runDate.getTime())) return;
    // If time is in the past, skip scheduling
    if (runDate <= new Date()) return;
    // Cancel existing job if any
    if (scheduledJobs.has(task.id)) {
      const existing = scheduledJobs.get(task.id);
      existing.cancel();
    }
    const job = schedule.scheduleJob(runDate, async function() {
      await sendNotificationForTask(task);
    });
    scheduledJobs.set(task.id, job);
  } catch (err) {
    console.error('scheduleTask error', err);
  }
}

async function scheduleAll() {
  await db.read();
  (db.data.tasks || []).forEach(t => scheduleTask(t));
}

async function sendNotificationForTask(task) {
  await db.read();
  const subs = db.data.subscriptions || [];
  const payload = JSON.stringify({
    title: task.title || 'Task reminder',
    body: task.message || `Reminder for ${task.title}`,
    data: { taskId: task.id }
  });
  const sendPromises = subs.map(s => {
    return webpush.sendNotification(s, payload).catch(err => {
      // remove subscriptions that are gone
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.data.subscriptions = db.data.subscriptions.filter(x => x.endpoint !== s.endpoint);
      } else {
        console.error('webpush error', err);
      }
    });
  });
  await Promise.all(sendPromises);
  await db.write();
}

// Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints

// get vapid public key
app.get('/vapidPublicKey', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// get tasks
app.get('/tasks', async (req, res) => {
  await db.read();
  res.json({ tasks: db.data.tasks || [] });
});

// create task
app.post('/tasks', async (req, res) => {
  const { title, message, time } = req.body;
  if (!title || !time) return res.status(400).json({ ok: false, error: 'title and time required' });
  await db.read();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const task = { id, title, message: message || '', time };
  db.data.tasks = db.data.tasks || [];
  db.data.tasks.push(task);
  await db.write();
  // schedule
  scheduleTask(task);
  res.json({ ok: true, task });
});

// register subscription
app.post('/register', async (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ ok: false, error: 'subscription required' });
  await db.read();
  db.data.subscriptions = db.data.subscriptions || [];
  // avoid duplicates
  if (!db.data.subscriptions.find(s => s.endpoint === sub.endpoint)) {
    db.data.subscriptions.push(sub);
    await db.write();
  }
  res.json({ ok: true });
});

// unregister subscription
app.post('/unregister', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ ok: false, error: 'endpoint required' });
  await db.read();
  db.data.subscriptions = (db.data.subscriptions || []).filter(s => s.endpoint !== endpoint);
  await db.write();
  res.json({ ok: true });
});

// remove task
app.post('/tasks/remove', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  await db.read();
  db.data.tasks = (db.data.tasks || []).filter(t => t.id !== id);
  await db.write();
  // cancel scheduled job
  if (scheduledJobs.has(id)) {
    scheduledJobs.get(id).cancel();
    scheduledJobs.delete(id);
  }
  res.json({ ok: true });
});

// Start server
(async () => {
  await initDB();
  await scheduleAll();
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
})();
