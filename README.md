Task Management App - Fixed version

What I changed:
- Replaced server.js with a working ESM Express server that uses lowdb, web-push, and node-schedule.
- Added a vapid-keys.js helper that generates VAPID keys and writes them to .env.
- Rewrote public/script.js to handle service worker registration, subscription flow, task creation, and task removal.
- Rewrote public/sw.js to handle push events and notification clicks.
- Added .env.example and updated package.json.

How to run:
1. Install dependencies:
   npm install

2. Generate VAPID keys (this writes to .env):
   npm run generate-vapid

3. Start the server:
   npm start

4. Open http://localhost:3000 in a supported browser (HTTPS is required for push in most contexts; localhost works for testing).

Notes:
- For push notifications to work outside localhost, you need HTTPS and valid VAPID keys.
- The server stores tasks and subscriptions in db.json.
