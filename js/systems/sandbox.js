/* ============ sandbox.js — admin sandbox inside a run (personal copy) ============
 * Pause → "Sandbox" (accounts only, admin passcode once per session). For
 * testing combos without grinding: moves (give, remove, level, max, evolve),
 * bonds, held items, level and evolution, partner / shiny, god mode, spawning
 * (enemies, bosses, legendaries, rift), the clock and the game speed.
 *
 * Anything done here marks the run as tampered (G.Game.sandboxUsed), so it is
 * never sent to the ranking. Solo runs only (in co-op the game doesn't pause).
 * The UI reuses the game's own boxes, tabs, chips and buttons.
 */
G.Sandbox = (() => {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TABS = [['moves', 'Moves'], ['build', 'Bonds & item'], ['mon', 'Level & form'], ['spawn', 'Spawn'], ['run', 'Clock & god']];
  let tab = 'moves', query = '', monQuery = '';

  // Game data names are Spanish: show them in the player's language (G.T), as the rest of the UI does.
  const mvName = m => (m.evolved ? G.T(m.baseName || m.def.name, 'move') + ' +' : G.T((m.def || m).name, 'move'));
  const tyName = t => G.T(G.U.TYPE_NAME[t]);
  const pl = () => G.Game.player;
  const available = () => !!(G.Admin && G.Admin.usable() && pl() && !G.Coop.active);
  const used = () => G.Game.sandboxUsed();

  function say(text) {
    const m = document.getElementById('sbx-msg');
    if (m) m.textContent = text;
  }

  // ---------------- actions ----------------

  function giveMove(id) {
    const p = pl();
    if (p.hasMove(id)) return say('Already known.');
    if (p.slots.length >= p.maxMoves) return say('All 4 slots are full: remove a move first.');
    used(); p.addMove(id); say('Learned ' + mvName(G.Moves.BY_ID[id]) + '.');
  }

  function removeMove(id) {
    const p = pl(), m = p.moves.find(x => x.id === id);
    if (!m || p.moves.length <= 1) return say('You need at least one move.');
    used();
    const cur = p.slots[p.active];
    p.moves = p.moves.filter(x => x !== m);
    p.slots = p.slots.map(s => s.filter(x => x !== m)).filter(s => s.length);
    p.arrange();
    const a = p.slots.indexOf(cur);
    p.active = a >= 0 ? a : 0;
    G.Projectiles.clearOrbs(p);
    say('Removed ' + mvName(m) + '.');
  }

  function levelMove(id, max) {
    const m = pl().moves.find(x => x.id === id);
    if (!m) return;
    used();
    let n = 0;
    while (G.Moves.levelUp(m) && max) n++;
    if (!max && m.lvl) n = 1;
    say(mvName(m) + ' is now Lv.' + m.lvl + (m.lvl >= m.def.maxLvl ? ' (max)' : '') + '.');
  }

  function evolveMove(id) {
    const m = pl().moves.find(x => x.id === id);
    if (!m) return;
    if (!G.Moves.EVO[id]) return say(mvName(m) + ' has no evolved form.');
    if (m.evolved) return say('Already evolved.');
    used();
    while (G.Moves.levelUp(m)) { /* evolving needs max level */ }
    G.Moves.evolve(m);
    say('Evolved into ' + mvName(m) + '.');
  }

  function fuseAll() {
    const p = pl(), opt = p.bondOptions();
    if (!opt) return say('Need at least two separate moves (or a bond group with room).');
    used();
    p.bonds++;
    const picked = opt.mode === 'add' ? opt.loose.slice(0, 1) : opt.loose.slice(0, 2);
    p.fuse(picked, opt.group);
    say('Bonded: ' + p.slots.find(s => s.includes(picked[0])).map(mvName).join(' + ') + '.');
  }

  function giveBond() {
    used(); pl().bonds++;
    say('Bond added: the bond picker opens when you resume (needs two separate moves).');
  }

  function unbondAll() {
    const p = pl();
    used();
    p.slots = p.moves.slice(0, p.maxMoves).map(m => [m]);
    p.moves = p.moves.slice(0, p.maxMoves);
    p.arrange(); p.active = 0;
    G.Projectiles.clearOrbs(p);
    say('All bonds undone (you keep your first 4 moves).');
  }

  function giveItem(id) {
    used(); pl().equip(id || null);
    say(id ? 'Holding ' + G.T(G.Items.BY[id].name) + '.' : 'Item removed.');
  }

  function setLevel(n) {
    G.Game.debugSetLevel(n);
    say('Level ' + pl().level + '.');
  }

  function evolveNow() {
    const p = pl(), opts = G.Evolve.options(p.dex);
    if (!opts.length) return say(p.mon.name + ' doesn\'t evolve.');
    used();
    G.Evolve.become(p, G.U.pick(opts), { fx: true }).then(() => render());
    close(true);
  }

  function setForm(dex, shiny) {
    if (!G.DEX_BY[dex] || !G.SPRITE_META[dex]) return say('No sprite for #' + dex + '.');
    used();
    say('Loading ' + G.DEX_BY[dex].name + '…');
    G.Evolve.become(pl(), dex, { shiny, fx: false }).then(() => { render(); say('Now playing as ' + pl().mon.name + (pl().shiny ? ' (shiny)' : '') + '.'); });
  }

  function spawn(kind, arg) {
    used();
    if (kind === 'wave') { G.Spawner.burst(arg); say(arg + ' enemies spawned.'); return; }
    if (kind === 'boss') { G.Spawner.debugBoss(arg); say('Boss incoming.'); return close(true); }
    if (kind === 'rift') { G.Rift.debugOpen(); say('A rift opened nearby.'); return close(true); }
    if (kind === 'legend') {
      if (G.Rift.inArena) return say('Already in a rift arena.');
      G.Rift.debugLegend(arg); return close(true);
    }
    if (kind === 'clear') {
      let n = 0;
      for (const e of G.EnemyMgr.all().slice()) if (!e.boss && !e.dead && e.hp > 0) { e.hurt(e.hp + 1); n++; }
      say(n + ' enemies defeated (bosses kept).');
    }
  }

  function setTime(t) { G.Game.debugTime(Math.max(0, t)); say('Clock ' + clock(t) + '.'); }
  function setSpeed(k) { used(); G.Game.debugSpeed(k); say('Game speed ×' + k + '.'); render(); }
  const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  // ---------------- panel ----------------

  function screen() {
    let el = document.getElementById('scr-sandbox');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'scr-sandbox';
    el.className = 'scr dim hidden';
    el.setAttribute('translate', 'no');
    el.innerHTML = `<div class="box settings sbx">
        <div class="row between"><h2>Sandbox</h2><button class="btn small gold" id="sbx-close">Back</button></div>
        <p class="sub sbx-warn">Admin test tools · this run won't count for the ranking</p>
        <div class="gen-tabs sbx-tabs" id="sbx-tabs"></div>
        <div id="sbx-body" class="set-body"></div>
        <p class="note sbx-msg" id="sbx-msg"></p>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#sbx-close').onclick = () => close();
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && !el.classList.contains('hidden') && !document.activeElement.matches('input')) {
        e.preventDefault(); e.stopImmediatePropagation(); close();
      }
    }, true);
    // One delegated handler for every button in the panel.
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b || !pl()) return;
      const a = b.dataset.a, v = b.dataset.v;
      ({
        tab: () => { tab = v; },
        give: () => giveMove(v), rm: () => removeMove(v), lv: () => levelMove(v, false), max: () => levelMove(v, true), evo: () => evolveMove(v),
        fuse: fuseAll, bond: giveBond, unbond: unbondAll, item: () => giveItem(v),
        lvl: () => setLevel(pl().level + +v), lvlset: () => setLevel(+document.getElementById('sbx-lvl').value || pl().level),
        cards: () => { G.Game.debugLevelUp(); close(true); },
        evonow: evolveNow, form: () => setForm(+v, false), formShiny: () => setForm(+v, true),
        shiny: () => setForm(pl().dex, !pl().shiny),
        god: () => { used(); pl().god = !pl().god; say('God mode ' + (pl().god ? 'on' : 'off') + '.'); },
        heal: () => { used(); pl().hp = pl().maxHp; say('Full HP.'); },
        spawn: () => spawn(v, +b.dataset.n || b.dataset.n),
        time: () => setTime(G.Game.time + +v), timeset: () => setTime(+v),
        speed: () => setSpeed(+v)
      }[a] || (() => {}))();
      if (!el.classList.contains('hidden')) render();      // (the button may be gone: actions can re-render)
    });
    el.addEventListener('input', e => {
      if (e.target.id === 'sbx-q') { query = e.target.value; renderList(); }
      if (e.target.id === 'sbx-mq') { monQuery = e.target.value; renderMons(); }
    });
    return el;
  }

  const btn = (a, v, label, cls = '') => `<button class="btn small ${cls}" data-a="${a}" data-v="${esc(v)}">${label}</button>`;

  function moveRow(m) {
    const d = m.def || m, col = G.U.TYPE_COLOR[d.type];
    return `<div class="set-row sbx-move"><span class="sbx-ico">${G.Icons.html('move:' + d.id, 22)}</span>
      <div class="grow"><b>${esc(mvName(m))}</b><small><span class="tag-chip" style="background:${col}">${esc(tyName(d.type))}</span> ${m.lvl ? 'Lv.' + m.lvl + '/' + d.maxLvl + (m.evolved ? ' · evolved' : '') : ''}</small></div>`;
  }

  function tabMoves() {
    const p = pl();
    const mine = p.moves.map(m => moveRow(m) + `<div class="sbx-acts">${btn('lv', m.id, 'Lv+')}${btn('max', m.id, 'Max')}${G.Moves.EVO[m.id] && !m.evolved ? btn('evo', m.id, 'Evolve', 'gold') : ''}${btn('rm', m.id, 'Remove', 'ghost')}</div></div>`).join('');
    return `<h3 class="set-h">Your moves (${p.slots.length}/${p.maxMoves} slots)</h3>${mine}
      <h3 class="set-h">All moves</h3>
      <input class="field sbx-q" id="sbx-q" placeholder="Search by name or type" value="${esc(query)}">
      <div id="sbx-list"></div>`;
  }

  function renderList() {
    const box = document.getElementById('sbx-list');
    if (!box) return;
    const q = query.trim().toLowerCase(), p = pl();
    const list = G.Moves.ALL.filter(d => !q || [d.name, mvName(d), d.type, tyName(d.type)].some(s => String(s).toLowerCase().includes(q)));
    box.innerHTML = list.slice(0, 60).map(d => moveRow(d) + `<div class="sbx-acts">${p.hasMove(d.id) ? '<span class="chip on">known</span>' : btn('give', d.id, 'Give', 'gold')}</div></div>`).join('')
      + (list.length > 60 ? `<p class="sub">${list.length - 60} more: refine the search.</p>` : '');
  }

  function tabBuild() {
    const p = pl();
    const groups = p.slots.map((s, i) => `<span class="chip ${s.length > 1 ? 'on' : ''}">${i + 1}: ${s.map(m => esc(mvName(m))).join(' + ')}</span>`).join(' ');
    const items = G.Items.LIST.map(it => `<button class="btn small ${p.item === it.id ? 'gold' : ''}" data-a="item" data-v="${it.id}" title="${esc(G.T(it.desc))}">${G.Icons.html(it.id, 16)} ${esc(G.T(it.name))}</button>`).join('');
    return `<h3 class="set-h">Bonds / fusions</h3><div class="chips">${groups}</div>
      <div class="row wrap sbx-btns">${btn('fuse', '', 'Bond moves now', 'gold')}${btn('bond', '', '+1 bond (pick on resume)')}${btn('unbond', '', 'Undo all bonds', 'ghost')}</div>
      <p class="sub">Bonds pending: ${p.bonds}. "Bond moves now" joins your first separate moves.</p>
      <h3 class="set-h">Held item</h3><div class="row wrap sbx-btns">${items}${btn('item', '', 'No item', 'ghost')}</div>`;
  }

  function tabMon() {
    const p = pl(), evo = G.Evolve.options(p.dex);
    return `<h3 class="set-h">Level ${p.level}</h3>
      <div class="row wrap sbx-btns">${btn('cards', '', '+1 with cards', 'gold')}${btn('lvl', 1, '+1')}${btn('lvl', 5, '+5')}${btn('lvl', 10, '+10')}${btn('lvl', -1, '−1', 'ghost')}
        <input class="field sbx-num" id="sbx-lvl" type="number" inputmode="numeric" min="1" max="200" placeholder="Lv">${btn('lvlset', '', 'Set')}</div>
      <h3 class="set-h">Form: ${esc(p.mon.name)}${p.shiny ? ' ★' : ''}</h3>
      <div class="row wrap sbx-btns">${evo.length ? btn('evonow', '', 'Evolve now → ' + evo.map(d => esc(G.DEX_BY[d].name)).join(' / '), 'gold') : '<span class="sub">No further evolution.</span>'}
        ${G.Sprites.hasShiny(p.dex) ? btn('shiny', '', p.shiny ? 'Shiny off' : 'Shiny on') : ''}</div>
      <h3 class="set-h">Change partner (this run)</h3>
      <input class="field sbx-q" id="sbx-mq" placeholder="Pokémon name or number" value="${esc(monQuery)}">
      <div id="sbx-mons" class="sbx-mons"></div>`;
  }

  function renderMons() {
    const box = document.getElementById('sbx-mons');
    if (!box) return;
    const q = monQuery.trim().toLowerCase();
    if (!q) { box.innerHTML = '<p class="sub">Type to search all 966.</p>'; return; }
    const list = G.DEX.filter(m => G.SPRITE_META[m.dex] && (String(m.dex) === q || m.name.toLowerCase().includes(q))).slice(0, 12);
    box.innerHTML = list.map(m => `<div class="set-row"><div class="grow"><b>#${m.dex} ${esc(m.name)}</b><small>${m.types.map(t => esc(tyName(t))).join(' / ')}${m.leg ? ' · legendary' : ''}</small></div>
      ${btn('form', m.dex, 'Play')}${G.Sprites.hasShiny(m.dex) ? btn('formShiny', m.dex, '★ Shiny') : ''}</div>`).join('') || '<p class="sub">No match.</p>';
  }

  function tabSpawn() {
    const legs = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
    return `<h3 class="set-h">Enemies</h3>
      <div class="row wrap sbx-btns">${[5, 20, 60].map(n => `<button class="btn small" data-a="spawn" data-v="wave" data-n="${n}">+${n} enemies</button>`).join('')}
        <button class="btn small ghost" data-a="spawn" data-v="clear">Clear enemies</button></div>
      <h3 class="set-h">Boss &amp; rift</h3>
      <div class="row wrap sbx-btns"><button class="btn small gold" data-a="spawn" data-v="boss">Next boss now</button>
        <button class="btn small" data-a="spawn" data-v="rift">Open a rift</button></div>
      <h3 class="set-h">Legendary arena</h3>
      <div class="row wrap sbx-btns sbx-legs">${legs.map(p => `<button class="btn small" data-a="spawn" data-v="legend" data-n="${p.dex}">${esc(p.name)}</button>`).join('')}</div>`;
  }

  function tabRun() {
    const p = pl(), t = G.Game.time;
    return `<h3 class="set-h">God mode</h3>
      <div class="row wrap sbx-btns">${btn('god', '', p.god ? 'Invincible: ON' : 'Invincible: OFF', p.god ? 'gold' : '')}${btn('heal', '', 'Full HP')}</div>
      <h3 class="set-h">Clock ${clock(t)}</h3>
      <div class="row wrap sbx-btns">${btn('time', 60, '+1 min')}${btn('time', 300, '+5 min')}${btn('time', -60, '−1 min', 'ghost')}
        ${btn('timeset', 4 * 60 - 5, 'Next biome (3:55)')}${btn('timeset', 30 * 60 - 10, 'Arceus (29:50)')}</div>
      <h3 class="set-h">Game speed</h3>
      <div class="row wrap sbx-btns">${[0.25, 0.5, 1, 2, 3].map(k => btn('speed', k, '×' + k)).join('')}</div>`;
  }

  function render() {
    const el = screen();
    el.querySelector('#sbx-tabs').innerHTML = TABS.map(([k, n]) => `<button class="gen-tab ${k === tab ? 'on' : ''}" data-a="tab" data-v="${k}"><b>${n}</b></button>`).join('');
    const body = el.querySelector('#sbx-body'), y = body.scrollTop, same = body.dataset.tab === tab;
    body.innerHTML = { moves: tabMoves, build: tabBuild, mon: tabMon, spawn: tabSpawn, run: tabRun }[tab]();
    body.dataset.tab = tab;
    if (tab === 'moves') renderList();
    if (tab === 'mon') renderMons();
    if (same) body.scrollTop = y;
  }

  /** Pause → Sandbox. */
  function open() {
    if (!available()) { G.UI.toast('The sandbox needs an account and a solo run.', 3000); return; }
    G.Admin.ask().then(ok => {
      if (!ok || G.Game.state !== 'paused') return;
      G.UI.hide('scr-pause');
      screen().classList.remove('hidden');
      say('');
      render();
    });
  }

  /** Back to the pause menu (or straight into the game with resume=true). */
  function close(resume = false) {
    const el = document.getElementById('scr-sandbox');
    if (el) el.classList.add('hidden');
    if (G.Game.state !== 'paused') return;
    if (resume) G.Game.togglePause();
    else G.RunUI.showPause();
  }

  return { open, close, available, get isOpen() { const el = document.getElementById('scr-sandbox'); return !!el && !el.classList.contains('hidden'); } };
})();
