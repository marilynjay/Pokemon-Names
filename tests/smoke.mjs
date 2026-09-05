import { chromium } from 'playwright';
const PORT = process.env.PORT ?? 8123;
// Prefer an explicit browser, else a preinstalled one, else Playwright's own.
const { existsSync } = await import('node:fs');
const { globSync } = await import('node:fs');
const found = process.env.CHROME_PATH
  ?? globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome').find(existsSync);
const b = await chromium.launch(found ? { executablePath: found } : {});
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

log('--- generation filter drops whole families ---');
// Regression: family generation used to come from the evolution root, so the
// Gen 2 babies (Pichu, Cleffa, Elekid...) filed their Kanto lines under Johto
// and unchecking Gen 1 still served up Pikachu.
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => { await p.locator('.gens label', { hasText: 'Gen 1' }).locator('input').uncheck(); });
const withoutKanto = [];
for (let i = 0; i < 12; i++) { withoutKanto.push(await guess()); await p.click('#actions button.good'); }
const kanto = ['Pichu', 'Pikachu', 'Raichu', 'Cleffa', 'Clefairy', 'Igglybuff', 'Jigglypuff', 'Tyrogue',
  'Happiny', 'Chansey', 'Mime Jr.', 'Smoochum', 'Elekid', 'Magby', 'Munchlax', 'Snorlax', 'Bulbasaur'];
const leaked = kanto.filter((n) => withoutKanto.includes(n));
log('Gen 1 off, first 12 cards:', withoutKanto.slice(0, 4).join(', '), '...');
log(leaked.length ? `LEAKED KANTO: ${leaked.join(', ')}` : 'no Kanto families leaked \u2713');
await settings(async () => { await p.locator('.gens label', { hasText: 'Gen 1' }).locator('input').check(); });

log('--- type filter ---');
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await guess();
log('Bulbasaur badges:', (await p.locator('.type-badges').innerText()).replace(/\n/g, ' + '));
await p.click('#actions button.good');
// The whole point: Gen 2 + Gen 3 families, Ghost types only.
await settings(async () => {
  await p.locator('.minis').first().getByText('None').click();
  for (const g of ['Gen 2', 'Gen 3']) await p.locator('.gens label', { hasText: g }).locator('input').check();
  await p.locator('.minis').nth(1).getByText('None').click();
  await p.locator('.types .badge', { hasText: 'Ghost' }).click();
  await p.locator('select').first().selectOption('0');
});
const total = +(await p.locator('#countPill').textContent()).split('/')[1].trim();
const ghosts = [];
for (let i = 0; i < total; i++) {
  ghosts.push(await guess());
  const types = (await p.locator('.type-badges').innerText()).split('\n');
  if (!types.includes('GHOST')) ghosts.push(`!! ${ghosts.at(-1)} is not Ghost (${types})`);
  await p.click('#actions button.good');
}
log(`Gen 2+3 Ghost = ${total} cards:`, ghosts.join(', '));
log('every card Ghost-typed:', ghosts.every((n) => !n.startsWith('!!')) ? 'yes \u2713' : 'NO');

log('--- empty filter + reset ---');
await settings(async () => { await p.click('text=None'); });
log('all gens off:', (await p.locator('#card').innerText()).replace(/\n/g, ' / '));
await settings(async () => { await p.click('text=All'); });
p.once('dialog', d => d.accept());
await settings(async () => { await p.click('text=Reset all progress'); });
log('after reset:', await p.locator('#scopeLabel').textContent());
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '✓ no console errors');
await b.close();
