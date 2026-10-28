// Evolución a mitad de partida (copia personal): datos de data/evolutions.js y
// las reglas de systems/evolve.js (cuándo evoluciona, qué stats cambian).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function load() {
  const G = {};
  new Function('G', source('js/data/pokedex.js'))(G);
  new Function('G', source('js/data/evolutions.js'))(G);
  G.DEX_BY = {};
  for (const p of G.DEX) G.DEX_BY[p.dex] = p;
  G.SPRITE_META = new Proxy({}, { get: () => ({}) });
  G.Mons = { natureOf: () => ({ id: 'hardy' }) };
  G.Coop = { active: false };
  new Function('G', source('js/systems/evolve.js'))(G);
  return G;
}

test('evolution data follows the real lines', () => {
  const G = load();
  assert.deepEqual(G.EVOS[1], [2]);
  assert.deepEqual(G.EVOS[2], [3]);
  assert.deepEqual(G.EVOS[813], [814]);
  assert.deepEqual(G.EVOS[814], [815]);
  assert.deepEqual(G.EVOS[133], [134, 135, 136, 196, 197, 470, 471, 700]);
  assert.equal(G.EVOS[3], undefined);              // Venusaur: final form
  assert.equal(G.EVO_FROM[6], 5);
});

test('every evolution is a game Pokémon, never legendary, and never itself', () => {
  const G = load();
  let n = 0;
  for (const a in G.EVOS) for (const b of G.EVOS[a]) {
    n++;
    assert.ok(G.DEX_BY[a] && G.DEX_BY[b], a + '->' + b);
    assert.ok(!G.DEX_BY[a].leg && !G.DEX_BY[b].leg, a + '->' + b);
    assert.notEqual(+a, b);
  }
  assert.ok(n > 400, 'pairs: ' + n);
});

test('check(): evolves at levels 10 and 20, once each, and skips single-stage Pokémon', () => {
  const G = load();
  const calls = [], real = G.Evolve;
  real.become = (pl, dex) => { calls.push(dex); pl.dex = dex; return Promise.resolve(true); };
  G.U = { pick: a => a[0] };
  const pl = { dex: 813, level: 9, dead: false };
  real.check(pl); assert.deepEqual(calls, []);
  pl.level = 10; real.check(pl); assert.deepEqual(calls, [814]);
  pl.evoBusy = false;
  pl.level = 11; real.check(pl); assert.deepEqual(calls, [814]);
  pl.level = 20; real.check(pl); assert.deepEqual(calls, [814, 815]);
  pl.evoBusy = false;
  pl.level = 30; real.check(pl); assert.deepEqual(calls, [814, 815]);   // only twice per run
  const solo = { dex: 128, level: 20 };                                  // Tauros: no evolution
  real.check(solo); assert.deepEqual(calls, [814, 815]);
  G.Coop.active = true;
  const coop = { dex: 1, level: 10 };
  real.check(coop); assert.deepEqual(calls, [814, 815]);                 // not in co-op
});

test('monAs(): the evolved form gets its own base stats', () => {
  const G = load();
  const a = G.Evolve.monAs(813, 813), b = G.Evolve.monAs(815, 813);
  assert.equal(b.dex, 815);
  assert.ok(b.hp > a.hp && b.atk > a.atk && b.spd > a.spd);
});
