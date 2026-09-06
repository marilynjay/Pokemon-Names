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
// All generations on, since regional forms now live in their own generation.
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => { await p.locator('select').first().selectOption('0'); });
const names = [];
for (let i = 0; i < 100; i++) {
  names.push(await guess());
  if (names.at(-1) === 'Alolan Meowth') {
    log('regional card facts:', (await p.locator('.facts').innerText()).replace(/\n/g, ' '),
        '| phon:', await p.locator('.phon').textContent(),
        '| types:', (await p.locator('.type-badges').innerText()).replace(/\n/g, '+'));
    await p.click('.speak');
    log('regional spoken:', JSON.stringify((await p.evaluate(() => window.__spoken)).at(-1)));
  }
  await p.click('#actions button.good');
}
const mi = names.indexOf('Meowth');
log('family run:', names.slice(mi, mi + 6).join(' > '));

log('--- generation filter ---');
// Each card sits in the generation that introduced it. Unchecking Gen 1 must
// drop Pikachu (Gen 1) while keeping Pichu (Gen 2), and Gen 7 alone must
// surface the Alolan forms even though their species are much older.
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => {
  await p.locator('.gens label', { hasText: 'Gen 1' }).locator('input').uncheck();
  await p.locator('select').first().selectOption('0');
});
const noKanto = [];
for (let i = 0; i < 40; i++) { noKanto.push(await guess()); await p.click('#actions button.good'); }
const gen1 = ['Bulbasaur', 'Pikachu', 'Raichu', 'Clefairy', 'Jigglypuff', 'Meowth', 'Persian', 'Snorlax', 'Chansey'];
const leaked = gen1.filter((n) => noKanto.includes(n));
log('Gen 1 off, first 4:', noKanto.slice(0, 4).join(', '));
log(leaked.length ? `LEAKED GEN 1: ${leaked.join(', ')}` : 'no Gen 1 Pok\u00e9mon leaked \u2713');
log('Pichu (a Gen 2 baby) still present:', noKanto.includes('Pichu') ? 'yes \u2713' : 'NO');

await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => {
  await p.locator('.minis').first().getByText('None').click();
  await p.locator('.gens label', { hasText: 'Gen 7' }).locator('input').check();
  await p.locator('select').first().selectOption('0');
});
const gen7Total = +(await p.locator('#countPill').textContent()).split('/')[1].trim();
const gen7 = [];
for (let i = 0; i < gen7Total; i++) { gen7.push(await guess()); await p.click('#actions button.good'); }
const alolan = gen7.filter((n) => n.startsWith('Alolan'));
log(`Gen 7 alone = ${gen7Total} cards, ${alolan.length} of them Alolan`);
log('includes Alolan Meowth:', gen7.includes('Alolan Meowth') ? 'yes \u2713' : 'NO');
log('excludes plain Meowth:', gen7.includes('Meowth') ? 'NO' : 'yes \u2713');

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

log('--- multiple choice ---');
await p.evaluate(() => { localStorage.clear(); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
await settings(async () => { await p.click('#m-choice'); await p.locator('select').first().selectOption('0'); });
await p.waitForSelector('.choices button');
const strip = (a) => a.map((t) => t.replace(/^\d/, '').trim());
let sameLetter = 0, malformed = 0, right = 0, wrong = 0;
for (let i = 0; i < 30; i++) {
  const opts = strip(await p.locator('.choices button').allTextContents());
  if (opts.length !== 4 || new Set(opts).size !== 4) malformed++;
  if (new Set(opts.map((n) => n[0].toUpperCase())).size === 1) sameLetter++;
  await p.locator('.choices button').nth(i % 4).click();
  const verdict = await p.locator('.result').textContent();
  verdict.startsWith('\u2713') ? right++ : wrong++;
  // the pick grades it, so the back offers Next rather than right/wrong
  if (await p.locator('#actions button.good').count()) log('!! self-grade buttons showed in choice mode');
  await p.click('#actions button');
}
log(`30 rounds: ${sameLetter} all-same-letter, ${malformed} malformed, ${right} right / ${wrong} wrong`);
log('scored into the meter:', await p.locator('#countPill').textContent(),
    '| retry bucket:', await p.locator('#retryPill').textContent());
await p.keyboard.press('3');
log('keyboard answer gave a verdict:', (await p.locator('.result').count()) ? 'yes \u2713' : 'NO');
await p.keyboard.press(' ');
log('space advanced to a fresh set of', await p.locator('.choices button').count(), 'options');
log('--- decoys for regional forms and thin letters ---');
// Regional decoys must share the region AND the species' first letter, minting
// names where real ones run out: Alolan Rattata vs Alolan Raticate, not Meowth.
await settings(async () => {
  await p.locator('.minis').first().getByText('None').click();
  await p.locator('.gens label', { hasText: 'Gen 7' }).locator('input').check();
});
let regionalRounds = 0, mixedBase = 0, mixedRegion = 0, sample = null;
for (let i = 0; i < 40 && regionalRounds < 6; i++) {
  const opts = strip(await p.locator('.choices button').allTextContents());
  await p.locator('.choices button').first().click();
  const name = await p.locator('.name').first().textContent();
  if (name.startsWith('Alolan')) {
    regionalRounds++;
    sample ??= `${name} -> ${opts.join(' | ')}`;
    if (!opts.every((n) => n.startsWith('Alolan'))) mixedRegion++;
    if (new Set(opts.map((n) => n.split(' ')[1][0])).size !== 1) mixedBase++;
  }
  await p.click('#actions button');
}
log(`${regionalRounds} Alolan rounds: ${mixedRegion} mixed region, ${mixedBase} mixed species letter`);
log('sample:', sample ?? 'none seen');

// X has only three real names, so the invented one has to fill the fourth slot.
await settings(async () => {
  await p.locator('.minis').first().getByText('None').click();
  await p.locator('.gens label', { hasText: 'Gen 2' }).locator('input').check();
  await p.locator('.minis').nth(1).getByText('None').click();
  await p.locator('.types .badge', { hasText: 'Psychic' }).click();
});
let xatu = null;
for (let i = 0; i < 60 && !xatu; i++) {
  const opts = strip(await p.locator('.choices button').allTextContents());
  await p.locator('.choices button').first().click();
  if ((await p.locator('.name').first().textContent()) === 'Xatu') xatu = opts;
  if (await p.locator('#actions button').count()) await p.click('#actions button'); else break;
}
log('Xatu options:', xatu ? xatu.join(' | ') : 'not reached');
log('all four start with X:', xatu && xatu.every((n) => n[0] === 'X') ? 'yes \u2713' : 'NO');

await settings(async () => { await p.locator('.minis').first().getByText('All').click(); await p.click('#m-flip'); });
log('back in flip mode, Guess button present:',
    (await p.locator('#actions button').textContent()).includes('Guess') ? 'yes \u2713' : 'NO');

log('--- empty filter + reset ---');
await settings(async () => { await p.click('text=None'); });
log('all gens off:', (await p.locator('#card').innerText()).replace(/\n/g, ' / '));
await settings(async () => { await p.click('text=All'); });
p.once('dialog', d => d.accept());
await settings(async () => { await p.click('text=Reset all progress'); });
log('after reset:', await p.locator('#scopeLabel').textContent());
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '✓ no console errors');
await b.close();
