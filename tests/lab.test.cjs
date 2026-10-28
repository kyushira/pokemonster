// Laboratorio (copia personal): mejoras de toda la cuenta pagadas con investigación.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = {};
new Function('G', fs.readFileSync(path.join(__dirname, '..', 'js/systems/lab.js'), 'utf8'))(G);
const Lab = G.Lab;

test('research: 1 per full minute + 2 per boss, none for tampered runs', () => {
  assert.equal(Lab.earned(59, 0, false), 0);
  assert.equal(Lab.earned(125, 1, false), 4);
  assert.equal(Lab.earned(600, 3, true), 0);
});

test('buy: costs Research, goes up one tier, stops at max', () => {
  const s = { labPts: 100 };
  const spent = Lab.COST.reduce((a, b) => a + b, 0);
  for (let i = 0; i < Lab.MAX; i++) assert.equal(Lab.buy('atk', s).ok, true);
  assert.equal(s.lab.atk, Lab.MAX);
  assert.equal(s.labPts, 100 - spent);
  assert.equal(Lab.buy('atk', s).ok, false);
  const poor = { labPts: 2 };
  assert.equal(Lab.buy('hp', poor).ok, false);
  assert.equal(poor.labPts, 2);
});

test('apply: multiplies on top of the run perks; nothing bought changes nothing', () => {
  const pl = () => ({ maxHp: 100, hp: 100, atkMul: 1.2, spdMul: 1, xpMul: 1, coinMul: 1 });
  const a = pl(); Lab.apply(a, {});
  assert.deepEqual(a, pl());
  const b = pl(); Lab.apply(b, { lab: { hp: 5, atk: 5, spd: 2, xp: 1, coins: 3 } });
  assert.equal(b.maxHp, 115); assert.equal(b.hp, 115);
  assert.ok(Math.abs(b.atkMul - 1.2 * 1.10) < 1e-9);
  assert.ok(Math.abs(b.spdMul - 1.03) < 1e-9);
  assert.ok(Math.abs(b.coinMul - 1.12) < 1e-9);
});

test('sanitize: a hand-edited save cannot go above max or below zero', () => {
  const s = { lab: { hp: 99, atk: -3, bogus: 4, xp: '2' }, labPts: -50 };
  Lab.sanitize(s);
  assert.deepEqual(s.lab, { hp: 5, atk: 0, xp: 2 });
  assert.equal(s.labPts, 0);
  const t = { lab: 'x' }; Lab.sanitize(t); assert.equal(t.lab, undefined);
});
