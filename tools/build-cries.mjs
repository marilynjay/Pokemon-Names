// Downloads every Pokémon cry from PokéAPI and converts it to mono MP3 in
// assets/cries/. PokéAPI publishes them as Ogg Vorbis, which Safari cannot play
// at all, so streaming the originals would leave the feature silent on iOS —
// MP3 is the one format every browser decodes.
//
//   node tools/build-cries.mjs [--force]
import { mkdirSync, existsSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
const OUT = join(ROOT, 'assets/cries');
const TMP = join(ROOT, '.cache/cries');
const force = process.argv.includes('--force');

const ffmpeg = (() => {
  try {
    return execFileSync('python3',
      ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
  } catch {
    return 'ffmpeg';   // fall back to one on PATH
  }
})();

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const cards = JSON.parse(readFileSync(join(ROOT, 'data/pokemon.json'), 'utf8')).cards;
let converted = 0, skipped = 0, failed = [];

for (let i = 0; i < cards.length; i += 16) {
  await Promise.all(cards.slice(i, i + 16).map(async (card) => {
    const out = join(OUT, `${card.id}.mp3`);
    if (existsSync(out) && !force) { skipped++; return; }
    const ogg = join(TMP, `${card.id}.ogg`);
    try {
      if (!existsSync(ogg)) {
        const res = await fetch(`${SOURCE}/${card.id}.ogg`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(ogg, Buffer.from(await res.arrayBuffer()));
      }
      // Mono at 48k: a cry is about a second of noisy retro audio, so this is
      // indistinguishable from the source and roughly halves the bytes.
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', ogg, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', out]);
      converted++;
    } catch (err) {
      failed.push(`${card.name} (${card.id}): ${err.message}`);
      rmSync(out, { force: true });
    }
  }));
  if (i % 320 === 0) process.stdout.write(`  ${i + 16}/${cards.length}\r`);
}

const total = cards.reduce((n, c) => n + (existsSync(join(OUT, `${c.id}.mp3`)) ? statSync(join(OUT, `${c.id}.mp3`)).size : 0), 0);
console.log(`\nconverted ${converted}, reused ${skipped}, failed ${failed.length}`);
if (failed.length) console.log(failed.slice(0, 10).join('\n'));
console.log(`assets/cries is ${(total / 1e6).toFixed(1)} MB across ${cards.length} cries`);
