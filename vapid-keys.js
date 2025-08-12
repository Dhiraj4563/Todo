import webpush from 'web-push';
import fs from 'fs';

const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC=' + keys.publicKey);
console.log('VAPID_PRIVATE=' + keys.privateKey);

// Optionally write to .env file
const envPath = './.env';
let env = '';
if (fs.existsSync(envPath)) {
  env = fs.readFileSync(envPath, 'utf8');
}
if (!env.includes('VAPID_PUBLIC')) {
  env += `\nVAPID_PUBLIC=${keys.publicKey}`;
}
if (!env.includes('VAPID_PRIVATE')) {
  env += `\nVAPID_PRIVATE=${keys.privateKey}`;
}
fs.writeFileSync(envPath, env.trim() + '\n');
console.log('Wrote keys to .env (or appended).');
