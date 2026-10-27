/* ============ admin.js — admin panel (passcode) ============
 * Personal-copy addition. Settings → Account → "Admin mode", passcode 0000,
 * opens a panel to add coins / gacha tickets and switch unlocks on and off.
 *
 * Toggles never lose real progress:
 *  - Turning one ON snapshots the real values into save.adminBackup[key]
 *    ({ at, data }) and then fills in everything.
 *  - While it is ON, anything genuinely earned (a creature caught or pulled, a
 *    legend beaten, an arena won, a move evolved, an item found) is also written
 *    into the snapshot via G.Admin.earned(), which db.js, gacha.js and
 *    progress.js call.
 *  - Turning it OFF puts the snapshot back and drops it.
 * Every change is committed (G.DB.commit()). Guests can't use it: their save is
 * never stored, so anything set here would vanish on the next reload.
 */
G.Admin = (() => {
  const PASSCODE = '0000';
  /** max amount per "Add" (keeps the numbers sane) */
  const ADD_MAX = 1e9;

  // key in the save -> label, what ON does
  const TOGGLES = [
    ['owned', 'Unlock all Pokémon', 'Own every creature in the Pokédex.'],
    ['shiny', 'All shinies', 'Own the shiny version of every creature.'],
    ['pupg', 'Maxed upgrades', 'Every upgrade at max level, for every creature.'],
    ['legends', 'Legendaries beaten', 'Every legendary counts as beaten in a rift.'],
    ['arenas', 'Rift arenas won', 'Every type arena counts as won.'],
    ['itemsFound', 'Items found', 'Every equippable item counts as found.'],
    ['evoMoves', 'Evolved moves', 'Every evolved move counts as discovered.'],
    ['ach', 'Achievements', 'Every achievement marked as done (no rewards paid).'],
    ['skins', 'Skins', 'Own every skin.'],
    ['bag', 'Shop items ×999', '999 of every shop item in the bag.']
  ];

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const clone = o => JSON.parse(JSON.stringify(isObj(o) ? o : {}));
  const usable = () => !!(G.DB.save && !G.DB.guest);
  const backups = s => (isObj(s.adminBackup) ? s.adminBackup : (s.adminBackup = {}));
  const isOn = k => { const s = G.DB.save; return !!(s && isObj(s.adminBackup) && s.adminBackup[k]); };

  /** All the keys a collection can have, and the value admin mode puts in. */
  function everything(k, now) {
    const out = {};
    const put = (ids, v) => { for (const id of ids) out[id] = typeof v === 'function' ? v(id) : v; };
    switch (k) {
      case 'owned': case 'shiny': put(G.DEX.map(p => p.dex), () => ({ at: now, from: 'admin' })); break;
      case 'pupg': {
        const maxed = {};
        for (const u of G.Upgrades.LIST) maxed[u.id] = u.max;
        put(G.DEX.map(p => p.dex), () => Object.assign({}, maxed));
        break;
      }
      case 'legends': put(G.DEX.filter(p => p.leg).map(p => p.dex), now); break;
      case 'arenas': put(Object.keys(G.Types.CHART), now); break;
      case 'itemsFound': put(G.Items.LIST.map(i => i.id), now); break;
      case 'evoMoves': put(Object.keys(G.Moves.EVO || {}), now); break;
      case 'ach': put(G.AchDefs.LIST.map(a => a.id), now); break;
      case 'skins': put(G.Skins.LIST, now); break;
      case 'bag': put(Object.keys(G.Shop.ITEMS || {}), 999); break;
    }
    return out;
  }

  /** How many entries a collection has now / could have (shown in the panel). */
  function count(k) {
    const s = G.DB.save, all = Object.keys(everything(k, 0));
    const have = isObj(s[k]) ? all.filter(id => s[k][id] != null && (k !== 'bag' || s[k][id] > 0)).length : 0;
    return [have, all.length];
  }

  /** After the collection changes, the partner must still be a creature you own. */
  function fixPartner(s) {
    const owned = Object.keys(s.owned || {});
    if (owned.length && !s.owned[s.partner]) {
      s.partner = s.starter && s.owned[s.starter] ? s.starter : +owned[0];
    }
    if (s.partnerShiny && !(s.shiny && s.shiny[s.partner])) s.partnerShiny = false;
  }

  /** Turn one toggle on or off. → { ok, saved, error? } */
  function setToggle(k, on) {
    if (!usable()) return { ok: false, error: 'Admin mode needs an account (guest saves are not kept).' };
    if (!TOGGLES.some(t => t[0] === k)) return { ok: false, error: 'Unknown toggle ' + k };
    const s = G.DB.save, b = backups(s);
    if (on && !b[k]) {
      const now = Date.now();
      b[k] = { at: now, data: clone(s[k]) };
      const all = everything(k, now);
      s[k] = isObj(s[k]) ? s[k] : {};
      if (k === 'pupg' || k === 'bag') Object.assign(s[k], all);
      else for (const id in all) if (s[k][id] == null) s[k][id] = all[id];
    } else if (!on && b[k]) {
      s[k] = clone(b[k].data);
      delete b[k];
      if (k === 'owned' || k === 'shiny') fixPartner(s);
    } else return { ok: true, saved: true };
    return { ok: true, saved: G.DB.commit() };
  }

  /**
   * Something was genuinely earned while a toggle may be on: keep it in the
   * snapshot so turning the toggle off doesn't take it away.
   */
  function earned(k, id, value) {
    const s = G.DB.save;
    const b = s && isObj(s.adminBackup) && s.adminBackup[k];
    if (!b || id == null) return;
    if (!isObj(b.data)) b.data = {};
    if (b.data[id] == null) b.data[id] = value != null ? value : Date.now();
  }

  /** Add coins ('coins') or gacha tickets ('t1' / 't10'). → { ok, saved, value, error? } */
  function add(what, amount) {
    if (!usable()) return { ok: false, error: 'Admin mode needs an account (guest saves are not kept).' };
    const n = Math.floor(+amount);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Enter a positive whole number.' };
    if (n > ADD_MAX) return { ok: false, error: 'At most ' + ADD_MAX.toLocaleString() + ' at a time.' };
    const s = G.DB.save;
    if (what === 'coins') s.coins = (s.coins || 0) + n;
    else if (what === 't1' || what === 't10') {
      s.tickets = Object.assign({ t1: 0, t10: 0 }, s.tickets);
      s.tickets[what] = (s.tickets[what] || 0) + n;
    } else return { ok: false, error: 'Unknown currency ' + what };
    const saved = G.DB.commit();
    return { ok: true, saved, value: what === 'coins' ? s.coins : s.tickets[what] };
  }

  // ---------------- panel ----------------

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let dirty = false;

  function screen() {
    let el = document.getElementById('scr-admin');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'scr-admin';
    el.className = 'scr dim hidden';
    el.innerHTML = `<div class="box settings">
        <div class="row between"><h2>Admin panel</h2><button class="btn small ghost" id="adm-close">Close</button></div>
        <div id="adm-body" class="set-body"></div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#adm-close').onclick = close;
    el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
    return el;
  }

  function addRow(what, label, value) {
    return `<div class="set-row adm-add"><div class="grow"><b>${esc(label)}</b><small>Now: <span id="adm-v-${what}">${value.toLocaleString()}</span></small></div>
      <input class="field" id="adm-in-${what}" type="number" inputmode="numeric" min="1" step="1" placeholder="Amount">
      <button class="btn small gold" data-add="${what}">Add</button></div>`;
  }

  function render() {
    const s = G.DB.save, box = document.getElementById('adm-body');
    if (!box || !s) return;
    const t = Object.assign({ t1: 0, t10: 0 }, s.tickets);
    box.innerHTML = `<h3 class="set-h">Currency</h3>`
      + addRow('coins', 'Coins', s.coins || 0)
      + addRow('t1', 'Gacha tickets ×1', t.t1)
      + addRow('t10', 'Gacha tickets ×10', t.t10)
      + `<h3 class="set-h">Unlocks</h3><p class="sub">Turning a switch off brings back your real progress from before you turned it on (plus anything you earned since).</p>
         <div class="adm-toggles">`
      + TOGGLES.map(([k, label, desc]) => {
        const on = isOn(k), [have, all] = count(k);
        return `<div class="set-row"><div class="grow"><b>${esc(label)}</b><small>${esc(desc)}</small></div>
          <span class="chip ${on ? 'on' : ''}" id="adm-n-${k}">${have}/${all}</span>
          <button class="btn small switch ${on ? 'gold' : ''}" data-tog="${k}" aria-pressed="${on}">${on ? 'On' : 'Off'}</button></div>`;
      }).join('')
      + `</div><div class="row wrap" style="gap:8px;margin-top:12px">
           <button class="btn small" data-all="1">All on</button>
           <button class="btn small" data-all="0">All off</button>
         </div><p class="note" id="adm-msg"></p>`;
    box.querySelectorAll('[data-tog]').forEach(b => {
      b.onclick = () => report(setToggle(b.dataset.tog, !isOn(b.dataset.tog)));
    });
    box.querySelectorAll('[data-all]').forEach(b => {
      b.onclick = () => {
        let r = { ok: true, saved: true };
        for (const [k] of TOGGLES) { const x = setToggle(k, b.dataset.all === '1'); if (!x.ok || !x.saved) r = x; }
        report(r);
      };
    });
    box.querySelectorAll('[data-add]').forEach(b => {
      const what = b.dataset.add, inp = document.getElementById('adm-in-' + what);
      const go = () => { const r = add(what, inp.value); if (r.ok) inp.value = ''; report(r); };
      b.onclick = go;
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  }

  function report(r) {
    if (r.ok) dirty = true;
    render();
    const msg = document.getElementById('adm-msg');
    const text = !r.ok ? r.error : r.saved ? 'Saved.' : 'Changed for this session only: the save could not be stored.';
    if (msg) msg.textContent = text;
    if (!r.ok || !r.saved) G.UI.toast(text, 3000);
    G.UI.refreshCoins();
  }

  function open() {
    if (!usable()) { G.UI.toast('Admin mode needs an account (guest saves are not kept).', 3500); return; }
    dirty = false;
    screen().classList.remove('hidden');
    render();
  }

  function close() {
    const el = document.getElementById('scr-admin');
    if (el) el.classList.add('hidden');
    // No reload needed: refresh what's on screen behind the panel.
    if (dirty && G.UI.isOpen('scr-menu') && !(G.SettingsUI && G.SettingsUI.isOpen)) G.MenuUI.open();
    dirty = false;
  }

  /** Settings → Account → "Admin mode": passcode, then the panel. */
  function prompt() {
    if (!usable()) { G.UI.toast('Admin mode needs an account (guest saves are not kept).', 3500); return; }
    const code = window.prompt('Admin passcode:');
    if (code == null) return;
    if (code.trim() !== PASSCODE) { G.UI.toast('Wrong passcode'); return; }
    if (G.SettingsUI && G.SettingsUI.isOpen) G.SettingsUI.close();
    open();
  }

  return {
    TOGGLES, prompt, open, close, setToggle, add, earned, count, isOn,
    get on() { return TOGGLES.some(([k]) => isOn(k)); }
  };
})();
