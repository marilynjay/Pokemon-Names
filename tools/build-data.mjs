// Builds data/pokemon.json from PokeAPI's source CSVs.
//
// PokeAPI's REST API is not always reachable, so we read the same data from the
// CSVs that back it (github.com/PokeAPI/pokeapi/tree/master/data/v2/csv) and
// shape it into the flat, evolution-ordered list the flashcard app wants.
//
//   node tools/build-data.mjs [--csv-dir <dir>] [--no-verify-art]

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const ENGLISH = '9';

const args = process.argv.slice(2);
const csvDir = args.includes('--csv-dir') ? args[args.indexOf('--csv-dir') + 1] : join(ROOT, '.cache/csv');
const verifyArt = !args.includes('--no-verify-art');

// Regional variants worth learning as their own name, mapped to their English
// adjective. Cosmetic, battle-only, Mega, Gigantamax and Totem forms are left
// out: they don't introduce a new name to memorise.
const REGIONS = {
  alola: 'Alolan',
  galar: 'Galarian',
  'galar-standard': 'Galarian',   // Darmanitan; the Zen form is the same name
  hisui: 'Hisuian',
  paldea: 'Paldean',
  'paldea-combat-breed': 'Paldean', // Tauros; all three breeds share one name
};

function parseCsv(text) {
  // The PokeAPI CSVs are simple but do contain quoted fields with commas.
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function loadCsv(name) {
  const path = join(csvDir, `${name}.csv`);
  if (!existsSync(path)) {
    mkdirSync(csvDir, { recursive: true });
    const res = await fetch(`${CSV_BASE}/${name}.csv`);
    if (!res.ok) throw new Error(`fetch ${name}.csv: HTTP ${res.status}`);
    writeFileSync(path, await res.text());
    console.log(`  downloaded ${name}.csv`);
  }
  return parseCsv(readFileSync(path, 'utf8'));
}

console.log('Loading CSVs...');
const [species, pokemon, forms, formNames, speciesNames, pokemonTypes, types, typeNames] = await Promise.all([
  loadCsv('pokemon_species'), loadCsv('pokemon'), loadCsv('pokemon_forms'),
  loadCsv('pokemon_form_names'), loadCsv('pokemon_species_names'),
  loadCsv('pokemon_types'), loadCsv('types'), loadCsv('type_names'),
]);
const versionGroups = await loadCsv('version_groups');

// Types are per-form, not per-species: Meowth is Normal, its Alolan form Dark
// and its Galarian form Steel. Ids above 10000 are the non-playable
// "unknown"/"shadow" placeholders and are skipped.
const typeNameOf = new Map();
for (const r of typeNames) if (r.local_language_id === ENGLISH) typeNameOf.set(+r.type_id, r.name);
const realTypes = types.filter((t) => +t.id < 10000);
const typesOf = new Map();
for (const r of pokemonTypes) {
  if (+r.type_id >= 10000) continue;
  if (!typesOf.has(+r.pokemon_id)) typesOf.set(+r.pokemon_id, []);
  typesOf.get(+r.pokemon_id).push({ slot: +r.slot, name: typeNameOf.get(+r.type_id) });
}
for (const list of typesOf.values()) list.sort((a, b) => a.slot - b.slot);

const nameOf = new Map();
for (const r of speciesNames) if (r.local_language_id === ENGLISH) nameOf.set(+r.pokemon_species_id, r.name);

// pokemon_id -> region key, plus the generation the form actually debuted in.
// A regional variant belongs to the generation that introduced it, not to its
// species' original one: Alolan Meowth is Gen 7 even though Meowth is Gen 1.
const vgGeneration = new Map(versionGroups.map((v) => [+v.id, +v.generation_id]));
const regionOf = new Map();
const formGenOf = new Map();
for (const f of forms) {
  if (f.is_battle_only === '1' || f.is_mega === '1') continue;
  if (!REGIONS[f.form_identifier]) continue;
  regionOf.set(+f.pokemon_id, f.form_identifier);
  const gen = vgGeneration.get(+f.introduced_in_version_group_id);
  if (gen) formGenOf.set(+f.pokemon_id, gen);
}

const speciesById = new Map(species.map((s) => [+s.id, s]));
const variantsOf = new Map(); // species_id -> pokemon rows we keep, default first
for (const p of pokemon) {
  const isDefault = p.is_default === '1';
  if (!isDefault && !regionOf.has(+p.id)) continue;
  if (!speciesById.has(+p.species_id)) continue;
  if (!variantsOf.has(+p.species_id)) variantsOf.set(+p.species_id, []);
  variantsOf.get(+p.species_id).push(p);
}
for (const list of variantsOf.values()) {
  list.sort((a, b) => (a.is_default === '1' ? 0 : 1) - (b.is_default === '1' ? 0 : 1) || +a.id - +b.id);
}

// Group species into evolution families, then walk each family from its
// unevolved root so a card's evolutions follow it directly.
const families = new Map();
for (const s of species) {
  const chain = +s.evolution_chain_id;
  if (!families.has(chain)) families.set(chain, []);
  families.get(chain).push(s);
}

const children = new Map();
for (const s of species) {
  const from = s.evolves_from_species_id ? +s.evolves_from_species_id : null;
  if (from === null) continue;
  if (!children.has(from)) children.set(from, []);
  children.get(from).push(+s.id);
}

const cards = [];
const groups = [];
for (const [chainId, members] of [...families].sort((a, b) => Math.min(...a[1].map((s) => +s.id)) - Math.min(...b[1].map((s) => +s.id)))) {
  const ids = new Set(members.map((s) => +s.id));
  const ordered = [];
  const walk = (id) => {
    ordered.push(id);
    for (const child of (children.get(id) ?? []).sort((a, b) => a - b)) if (ids.has(child)) walk(child);
  };
  for (const s of members.sort((a, b) => +a.id - +b.id)) {
    const from = s.evolves_from_species_id ? +s.evolves_from_species_id : null;
    if (from === null || !ids.has(from)) walk(+s.id);
  }

  // A family is named for its lowest Pokédex number, not for whichever species
  // sits at the root of the tree: Gen 2 and 4 added babies that evolve into much
  // older Pokémon, so keying off the root would call this the Munchlax family
  // rather than Snorlax's.
  const headSpecies = Math.min(...ordered);
  const group = {
    id: chainId,
    name: nameOf.get(headSpecies) ?? speciesById.get(headSpecies).identifier,
    dex: headSpecies,
    members: [],
  };

  for (const speciesId of ordered) {
    for (const p of variantsOf.get(speciesId) ?? []) {
      const region = regionOf.get(+p.id);
      const base = nameOf.get(speciesId) ?? speciesById.get(speciesId).identifier;
      const speciesGen = +speciesById.get(speciesId).generation_id;
      cards.push({
        id: +p.id,
        name: region ? `${REGIONS[region]} ${base}` : base,
        base,
        dex: speciesId,
        gen: (region && formGenOf.get(+p.id)) || speciesGen,
        group: chainId,
        region: region ? REGIONS[region] : null,
        types: (typesOf.get(+p.id) ?? []).map((t) => t.name),
      });
      group.members.push(+p.id);
    }
  }
  groups.push(group);
}

if (verifyArt) {
  console.log(`Checking official artwork for ${cards.length} entries...`);
  let missing = 0;
  for (let i = 0; i < cards.length; i += 24) {
    await Promise.all(cards.slice(i, i + 24).map(async (c) => {
      const res = await fetch(`${SPRITE_BASE}/other/official-artwork/${c.id}.png`, { method: 'HEAD' });
      if (!res.ok) { c.art = 0; missing++; }
    }));
  }
  console.log(`  ${missing} entries fall back to the pixel sprite`);
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  spriteBase: SPRITE_BASE,
  generations: [...new Set(cards.map((c) => c.gen))].sort((a, b) => a - b),
  // Only types some Pokémon actually has natively — this drops Stellar, which
  // exists as a Terastal type but is nobody's real typing, so it would show up
  // as a filter that can never match anything.
  types: [...new Set(cards.flatMap((c) => c.types))].sort(),
  groups,
  cards,
};
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/pokemon.json'), JSON.stringify(out));
console.log(`Wrote data/pokemon.json — ${cards.length} cards in ${groups.length} families`);
