// public/script.js - improved subscription and task management
const subscribeBtn = document.getElementById('subscribeBtn');
const createBtn = document.getElementById('createBtn');
const tasksEl = document.getElementById('tasks');
const titleInput = document.getElementById('title');
const timeInput = document.getElementById('time');
const messageInput = document.getElementById('message');

let registration = null;
let subscription = null;
let vapidPublicKey = null;

async function init() {
  // register service worker
  if ('serviceWorker' in navigator) {
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered', registration);
    } catch (err) {
      console.error('SW registration failed', err);
    }
  }

  // fetch VAPID key
  try {
    const r = await fetch('/vapidPublicKey');
    const j = await r.json();
    vapidPublicKey = j.publicKey;
  } catch (e) {
    console.error('Could not load vapid key', e);
  }

  // check existing subscription
  if (registration && registration.pushManager) {
    subscription = await registration.pushManager.getSubscription();
    updateSubscribeBtn();
  }

  loadTasks();
}

function updateSubscribeBtn() {
  if (!subscribeBtn) return;
  if (subscription) {
    subscribeBtn.textContent = 'Unsubscribe from notifications';
  } else {
    subscribeBtn.textContent = 'Subscribe to notifications';
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribe() {
  if (!registration) return alert('Service worker not registered');
  if (!vapidPublicKey) return alert('VAPID public key not available on server');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return alert('Please allow notifications');

  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
    // send to server
    await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    updateSubscribeBtn();
    alert('Subscribed!');
  } catch (err) {
    console.error('Subscribe failed', err);
    alert('Could not subscribe: ' + err);
  }
}

async function unsubscribe() {
  if (!subscription) return;
  try {
    await fetch('/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    await subscription.unsubscribe();
    subscription = null;
    updateSubscribeBtn();
    alert('Unsubscribed');
  } catch (err) {
    console.error('Unsubscribe failed', err);
  }
}

subscribeBtn && subscribeBtn.addEventListener('click', () => {
  if (subscription) unsubscribe();
  else subscribe();
});

createBtn && createBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim();
  const time = timeInput.value;
  const message = messageInput.value.trim();
  if (!title || !time) return alert('Please provide title and time');
  try {
    const r = await fetch('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, time })
    });
    const j = await r.json();
    if (j.ok) {
      titleInput.value = '';
      messageInput.value = '';
      timeInput.value = '';
      loadTasks();
      alert('Task created and scheduled (if time is in future).');
    } else {
      alert('Error creating task: ' + (j.error || 'unknown'));
    }
  } catch (err) {
    console.error('Create task error', err);
  }
});

async function loadTasks() {
  try {
    const r = await fetch('/tasks');
    const j = await r.json();
    tasksEl.innerHTML = '';
    (j.tasks || []).sort((a,b) => new Date(a.time) - new Date(b.time)).forEach(t => {
      const li = document.createElement('li');
      li.textContent = `${t.title} — ${new Date(t.time).toLocaleString()}`;
      // remove button
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.style.marginLeft = '10px';
      btn.addEventListener('click', async () => {
        await fetch('/tasks/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: t.id })
        });
        loadTasks();
      });
      li.appendChild(btn);
      tasksEl.appendChild(li);
    });
  } catch (err) {
    console.error('Load tasks error', err);
  }
}

window.addEventListener('load', init);
