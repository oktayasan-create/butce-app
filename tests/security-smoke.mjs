import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html','utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json','utf8'));
const rules = fs.readFileSync('firestore.rules.example','utf8');
const sw = fs.readFileSync('sw.js','utf8');

const moduleMatch = html.match(/<script\\s+type="module">([\\s\\S]*?)<\\/script>/);
assert(moduleMatch, 'Main JavaScript module must exist');
const tmp = path.join(os.tmpdir(), 'butceapp-security-check.mjs');
try {
  fs.writeFileSync(tmp, moduleMatch[1]);
  const syntax = spawnSync(process.execPath,['--check',tmp], {encoding:'utf8'});
  assert.equal(syntax.status,0,'Application JS syntax error: '+syntax.stderr);
} finally { try {fs.unlinkSync(tmp)}catch {} }

assert(html.includes('onAuthStateChanged(auth,'), 'Must have Firebase auth state gate');
assert(html.includes('browserSessionPersistence'), 'Session should not be indefinitely retained');
assert(html.includes('const probe = await getDoc(doc(db, "data", "settings"))'), 'Verify Firestore access before showing data');
assert(html.includes('if (!probe.exists())'), 'Existing settings document must be verified');
assert(html.includes('auth.currentUser?.uid !== user.uid'), 'Prevent stale async auth state from unlocking app');
assert(html.includes('document.body.classList.remove("auth-locked")'), 'Unlock only after verifying access');
assert(html.includes('authGate.hidden = true'), 'Successful login must remove gate');
assert(html.includes('signOut(auth)'), 'Must provide sign out');
assert(html.includes('body.auth-locked .app-layout'), 'Hide financial UI until authorized');
assert(html.includes('authSwitch'), 'User must be able to sign out when Firestore remains locked');

assert(rules.includes('request.auth.uid'), 'Rules must bind access to an authenticated UID');
assert(rules.includes('REPLACE_WITH_YOUR_FIREBASE_AUTH_UID'), 'Do not commit a real owner UID');
assert(!/allow\\s+read\\s*,\\s*write\\s*:\\s*if\\s+true/.test(rules), 'Unrestricted database rules are forbidden');

assert.equal(manifest.display, 'standalone');
assert(manifest.icons.length > 0);
for (const icon of manifest.icons) assert(fs.existsSync(icon.src), 'Manifest icon missing: '+icon.src);
assert(html.includes('navigator.serviceWorker.register("./sw.js")'), 'PWA shell must be registered');
assert(sw.includes('self.addEventListener(\'fetch\''), 'Service worker must handle navigation');
console.log('PASS: JS syntax, auth gate, ownership rules template, app manifest, service worker');
