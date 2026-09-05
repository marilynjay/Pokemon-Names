import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 420, height: 880 } });
await p.route('**raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/gif',
  body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }));
await p.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#actions button');
// Uncheck Gen 1 only, exactly as the user did, and remove the session cap.
await p.click('#settingsBtn');
await p.locator('.gens label', { hasText: 'Gen 1' }).locator('input').uncheck();
await p.locator('select').first().selectOption('0');
await p.click('#settingsBtn');
await p.waitForSelector('#actions button');
console.log('session size with Gen 1 off:', await p.locator('#countPill').textContent());
const seen = [];
for (let i = 0; i < 400; i++) {
  await p.click('#actions button');
  seen.push(await p.locator('.name').textContent());
  await p.click('#actions button.good');
}
const kanto = ['Pichu','Pikachu','Raichu','Cleffa','Clefairy','Igglybuff','Jigglypuff','Tyrogue','Hitmonlee',
  'Happiny','Chansey','Mime Jr.','Mr. Mime','Smoochum','Jynx','Elekid','Electabuzz','Magby','Magmar',
  'Munchlax','Snorlax','Bulbasaur','Meowth','Charmander'];
const leaked = kanto.filter(n => seen.includes(n));
console.log('first 400 cards contained', seen.length, 'names');
console.log('Kanto-family leaks:', leaked.length ? leaked.join(', ') : 'NONE ✓');
console.log('sample of what shows instead:', seen.slice(0, 8).join(', '));
await b.close();
