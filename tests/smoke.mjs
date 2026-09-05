import { chromium } from 'playwright';
const PORT = process.env.PORT ?? 8123;
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.route('**raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/gif',
  body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }));
// Capture what would be spoken; headless Chromium has no real voices.
await p.addInitScript(() => {
  window.__spoken = [];
  const fake = { getVoices: () => [{ name: 'Test', lang: 'en-US', voiceURI: 'test', localService: true }],
    cancel() {}, speak(u) { window.__spoken.push(u.text); u.onstart?.(); u.onend?.(); }, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(t) { this.text = t; } }, configurable: true });
});
const log = (...a) => console.log('·', ...a);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
const guess = async () => { await p.click('#actions button'); return p.locator('.name').textContent(); };
const settings = async (fn) => { await p.click('#settingsBtn'); await fn(); await p.click('#settingsBtn'); await p.waitForSelector('#actions button'); };

log('meter start', await p.locator('#countPill').textContent());
log('card 1', await guess(), '|', await p.locator('.phon').textContent());
await p.click('#actions button.good');
log('meter after 1 right', await p.locator('#countPill').textContent(), 'bar', await p.locator('#barFill').evaluate(e => e.style.width));
await guess(); await p.click('#actions button.bad');
log('meter after 1 wrong', await p.locator('#countPill').textContent(), '| retry', await p.locator('#retryPill').textContent());

log('--- pronunciation ---');
await guess();
await p.click('.speak');
log('spoke:', JSON.stringify(await p.evaluate(() => window.__spoken)));
await p.keyboard.press('p');
log('after P key:', JSON.stringify(await p.evaluate(() => window.__spoken)));
await p.keyboard.press('ArrowRight');
log('ArrowRight graded, meter now', await p.locator('#countPill').textContent());

log('--- regional form card ---');
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => { await p.click('text=None'); await p.locator('.gens label', { hasText: 'Gen 1' }).locator('input').check(); await p.locator('select').first().selectOption('0'); });
const names = [];
for (let i = 0; i < 100; i++) { names.push(await guess()); await p.click('#actions button.good'); }
const mi = names.indexOf('Meowth');
log('family run:', names.slice(mi, mi + 6).join(' > '));
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => { await p.click('text=None'); await p.locator('.gens label', { hasText: 'Gen 1' }).locator('input').check(); await p.locator('select').first().selectOption('0'); });
for (let i = 0; i < 78; i++) { const n = await guess(); if (n === 'Alolan Meowth') { log('regional card facts:', (await p.locator('.facts').innerText()).replace(/\n/g, ' '), '| phon:', await p.locator('.phon').textContent()); await p.click('.speak'); log('regional spoken:', JSON.stringify((await p.evaluate(() => window.__spoken)).at(-1))); } await p.click('#actions button.good'); }

log('--- empty filter + reset ---');
await settings(async () => { await p.click('text=None'); });
log('all gens off:', (await p.locator('#card').innerText()).replace(/\n/g, ' / '));
await settings(async () => { await p.click('text=All'); });
p.once('dialog', d => d.accept());
await settings(async () => { await p.click('text=Reset all progress'); });
log('after reset:', await p.locator('#scopeLabel').textContent());
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '✓ no console errors');
await b.close();
