/* ============ lab.js — the Lab: account-wide upgrades (personal copy) ============
 * Idea from PokéTide. Unlike Mejoras (per Pokémon, paid in coins), the Lab's
 * upgrades count for EVERY partner and are paid in Research, which you earn
 * at the end of each run: 1 per full minute survived + 2 per boss defeated.
 * Runs touched by the admin sandbox earn none.
 *
 * Saved as save.lab = { hp, atk, spd, xp, coins } (tiers) and save.labPts.
 * Applied at the start of each run (G.Lab.apply), after the Mejoras perks.
 */
G.Lab = (() => {
  const MAX = 5;
  const COST = [3, 6, 10, 15, 22];             // Research for tier 1..5
  const LIST = [
    { id: 'hp', icon: 'heart', name: 'Vitality research', unit: '+3% max HP', per: 0.03 },
    { id: 'atk', icon: 'fist', name: 'Power research', unit: '+2% damage', per: 0.02 },
    { id: 'spd', icon: 'boot', name: 'Agility research', unit: '+1.5% speed', per: 0.015 },
    { id: 'xp', icon: 'book', name: 'Study research', unit: '+4% experience', per: 0.04 },
    { id: 'coins', icon: 'coin', name: 'Treasure research', unit: '+4% Pokécoins', per: 0.04 }
  ];
  const BY = Object.fromEntries(LIST.map(u => [u.id, u]));

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const tier = (s, id) => Math.max(0, Math.min(MAX, Math.floor(+(isObj(s && s.lab) ? s.lab[id] : 0) || 0)));
  const pts = s => Math.max(0, Math.floor(+(s && s.labPts) || 0));

  /** Multipliers from the save (×1 when nothing is bought). */
  function mults(s) {
    const out = {};
    for (const u of LIST) out[u.id] = 1 + tier(s, u.id) * u.per;
    return out;
  }

  /** Start of a run: the Lab on top of everything else. */
  function apply(pl, s = G.DB.save) {
    const m = mults(s);
    pl.maxHp = Math.round(pl.maxHp * m.hp); pl.hp = pl.maxHp;
    pl.atkMul *= m.atk;
    pl.spdMul *= m.spd;
    pl.xpMul *= m.xp;
    pl.coinMul *= m.coins;
  }

  /** Research earned by a run. */
  function earned(time, bosses, tampered) {
    if (tampered) return 0;
    return Math.floor(Math.max(0, time) / 60) + 2 * Math.max(0, bosses | 0);
  }

  /** End of a run: bank the Research (the run commits the save afterwards). */
  function bank(s, n) {
    if (!(n > 0)) return 0;
    s.labPts = pts(s) + n;
    return n;
  }

  /** Buy the next tier. → { ok, error? } */
  function buy(id, s = G.DB.save) {
    const u = BY[id];
    if (!u || !s) return { ok: false, error: 'Unknown upgrade.' };
    const t = tier(s, id);
    if (t >= MAX) return { ok: false, error: 'Already at max.' };
    const c = COST[t];
    if (pts(s) < c) return { ok: false, error: 'Not enough Research (' + pts(s) + '/' + c + ').' };
    s.lab = isObj(s.lab) ? s.lab : {};
    s.lab[id] = t + 1;
    s.labPts = pts(s) - c;
    return { ok: true };
  }

  /** db.js sanitize: keep only valid tiers and a whole, non-negative balance. */
  function sanitize(s) {
    if (s.lab != null) {
      if (!isObj(s.lab)) delete s.lab;
      else for (const k of Object.keys(s.lab)) { if (!BY[k]) delete s.lab[k]; else s.lab[k] = tier(s, k); }
    }
    if (s.labPts != null) s.labPts = pts(s);
  }

  // ---------------- screen (menu → Lab), in the game's box style ----------------

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function screen() {
    let el = document.getElementById('scr-lab');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'scr-lab';
    el.className = 'scr dim hidden';
    el.setAttribute('translate', 'no');
    el.innerHTML = `<div class="box settings lab-box">
        <div class="row between"><h2>${G.Icons.html('capsule', 26)} Lab</h2><button class="btn small ghost" id="lab-close">Back</button></div>
        <p class="sub">Upgrades for <b>every</b> Pokémon. Paid in Research: 1 per minute survived and 2 per boss defeated, at the end of each run.</p>
        <div class="lab-pts" id="lab-pts"></div>
        <div id="lab-body" class="set-body"></div>
        <p class="note" id="lab-msg"></p>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#lab-close').onclick = close;
    el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-buy]');
      if (!b) return;
      const r = buy(b.dataset.buy);
      if (r.ok) { G.DB.commit(); G.Audio.sfx('confirm'); }
      else G.Audio.sfx('back');
      render();
      document.getElementById('lab-msg').textContent = r.ok ? BY[b.dataset.buy].name + ' upgraded.' : r.error;
    });
    return el;
  }

  function render() {
    const s = G.DB.save;
    document.getElementById('lab-pts').innerHTML = `${G.Icons.html('star', 18)} Research: <b class="gold">${pts(s)}</b>`;
    document.getElementById('lab-body').innerHTML = LIST.map(u => {
      const t = tier(s, u.id), c = COST[t];
      const pips = Array.from({ length: MAX }, (_, i) => `<i class="${i < t ? 'on' : ''}"></i>`).join('');
      return `<div class="set-row lab-row"><span class="lab-ico">${G.Icons.html(u.icon, 26)}</span>
        <div class="grow"><b>${esc(u.name)}</b><small>${esc(u.unit)} per tier · now +${Math.round(t * u.per * 1000) / 10}%</small><div class="lab-pips">${pips}</div></div>
        ${t >= MAX ? '<span class="chip on">Max</span>' : `<button class="btn small ${pts(s) >= c ? 'gold' : ''}" data-buy="${u.id}" ${pts(s) >= c ? '' : 'disabled'}>${G.Icons.html('star', 14)} ${c}</button>`}</div>`;
    }).join('');
  }

  function open() {
    if (!G.DB.save) return;
    screen().classList.remove('hidden');
    document.getElementById('lab-msg').textContent = '';
    render();
  }

  function close() {
    const el = document.getElementById('scr-lab');
    if (el) el.classList.add('hidden');
  }

  return { LIST, MAX, COST, mults, apply, earned, bank, buy, sanitize, open, close, tier, pts };
})();
