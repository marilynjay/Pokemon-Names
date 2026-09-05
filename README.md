# Pokémon Name Trainer

Flashcards for learning Pokémon names — and how to actually say them.

You see the artwork, guess, then flip the card to check. The back shows the name,
a phonetic respelling, and a **Pronounce** button. Mark yourself right or wrong:
wrong cards come back a few cards later in the same session, right ones drop out
of the pool and return days later.

## Running it

It's a static page, but browsers block `fetch` from `file://`, so serve the folder:

```sh
npm run serve      # or: python3 -m http.server 8123
```

Then open <http://localhost:8123>. It also works unchanged on GitHub Pages —
turn Pages on for this branch and the root directory.

Nothing is installed at runtime and there is no build step. Artwork is loaded
from the PokéAPI sprite CDN; everything else ships in this repo.

## How it works

### Evolution families

Cards are grouped by evolution family, with regional variants sitting next to the
form they're a variant of:

> Meowth → Alolan Meowth → Galarian Meowth → Persian → Alolan Persian → Perrserker

That's the default order. The alternatives are strict Pokédex number (which
splits families — Perrserker lands at #863) and shuffled. Shuffling keeps
families together by default; there's a toggle if you'd rather it didn't.

### Scheduling

A Leitner box per card. Answer right and it moves up a box and goes quiet for
4 hours → 1 day → 3 days → 1 week → 3 weeks → 2 months. Answer wrong and it drops
back to box 0 and re-enters the queue six cards later, so you meet it again
before the session ends.

A session defaults to 40 due cards, rounded up so an evolution family never gets
split across two sessions. **Reset all progress** in settings clears the lot.

Progress and settings live in `localStorage`, in that browser only — nothing is
synced or sent anywhere.

### Filtering

Generation checkboxes, type chips, and a switch for regional forms — they stack,
so "Gen 2 and 3, Ghost only" gives you a 7-card deck.

Both filters match **individual Pokémon**, not whole families, because both
properties vary within a family. Meowth is a Gen 1 Normal type; Alolan Meowth is
a Gen 7 Dark type; Galarian Meowth is a Gen 8 Steel type; Perrserker is a Gen 8
Steel type. So checking Gen 7 surfaces Alolan Meowth without the rest of its
line, and unchecking Gen 1 retires Pikachu while leaving Pichu — a Johto
Pokémon — in place.

Counting this way lands on the canonical per-generation figures: 151 for Kanto,
100 for Johto, 135 for Hoenn, 72 for Kalos.

Evolution families still stay grouped in the running order. Filtering just means
you may meet part of a family rather than all of it. A card matches on type if
*any* of its types is selected, and both types show on the back as coloured badges.

### On your phone

Add it to the home screen and it opens full-screen with its own icon, no browser
chrome. One caveat on iOS: a home-screen web app gets a **separate storage
container** from Safari, so progress you built up in the browser won't carry over
into the installed copy — start as you mean to continue.

### Keyboard

`Space` flip · `←` / `J` missed · `→` / `K` got it · `P` pronounce · `Esc` close settings

## Repo layout

| Path | What it is |
| --- | --- |
| `index.html` | The whole app — markup, styles and logic |
| `data/pokemon.json` | 1080 cards across 541 evolution families |
| `data/pronunciations.json` | Phonetic respellings |
| `tools/build-data.mjs` | Regenerates `data/pokemon.json` |
| `tools/pronunciations.mjs` | Source for the respellings |
| `assets/icon.svg` | Home-screen icon, drawn by hand |
| `tools/make-icons.mjs` | Rasterises that SVG to the PNGs iOS and Android need |
| `manifest.webmanifest` | Web-app metadata for installing to a home screen |
| `tests/smoke.mjs` | Playwright walk-through of the study flow |

## Regenerating the data

```sh
npm run build-data
```

Reads PokéAPI's [source CSVs](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
(cached in `.cache/csv`), walks each evolution chain, keeps the regional variants
worth learning as separate names — Alolan, Galarian, Hisuian, Paldean — and drops
Mega, Gigantamax, Totem, battle-only and cosmetic forms, which don't introduce a
new name. It then checks every sprite URL, so a missing image is caught at build
time rather than by you mid-session.

Respellings are keyed by species name in `tools/pronunciations.mjs`; edit there
and re-run the inline export step, or edit `data/pronunciations.json` directly.

## Tests

```sh
npm run serve &
npm test
```

Drives a real browser through flipping, grading, the retry bucket, the settings
filters, the family ordering, pronunciation output and reset.

## The icon

`assets/icon.svg` is an original drawing — a Pikachu-inspired face, not Nintendo
artwork, so nothing copyrighted is committed here. iOS won't accept SVG for
`apple-touch-icon`, so `npm run build-icons` rasterises it to 180/192/512px PNGs
via headless Chromium. Re-run it after editing the SVG.

## Credits

Data and sprites from [PokéAPI](https://pokeapi.co). Pokémon names and artwork
are © Nintendo / Game Freak / The Pokémon Company; this is a personal study tool
and isn't affiliated with them.
