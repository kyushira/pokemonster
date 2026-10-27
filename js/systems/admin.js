/* ============ admin.js — admin mode: unlock everything with a passcode ============
 * Personal-copy addition. Settings → Account → "Admin mode", passcode 0000.
 * Writes straight into the current save (G.DB.save) and commits it.
 */
G.Admin = (() => {
  const PASSCODE = '0000';
  const COINS = 9999999;

  function unlockAll() {
    const s = G.DB.save;
    if (!s) return { ok: false, error: 'No save loaded. Log in (not as guest) first.' };
    const now = Date.now();
    const stamp = o => { o = o || {}; return o; };

    // Every creature + its shiny, every legendary beaten
    s.owned = stamp(s.owned); s.shiny = stamp(s.shiny); s.legends = stamp(s.legends);
    for (const p of G.DEX) {
      if (!s.owned[p.dex]) s.owned[p.dex] = { at: now, from: 'admin' };
      if (!s.shiny[p.dex]) s.shiny[p.dex] = { at: now, from: 'admin' };
      if (p.leg && !s.legends[p.dex]) s.legends[p.dex] = now;
    }

    // Upgrades maxed for every creature
    s.pupg = stamp(s.pupg);
    const maxed = {};
    for (const u of G.Upgrades.LIST) maxed[u.id] = u.max;
    for (const p of G.DEX) s.pupg[p.dex] = Object.assign({}, maxed);

    // Rift arenas, items, evolved moves, achievements, skins
    s.arenas = stamp(s.arenas);
    for (const t of Object.keys(G.Types.CHART)) s.arenas[t] = s.arenas[t] || now;
    s.itemsFound = stamp(s.itemsFound);
    for (const it of G.Items.LIST) s.itemsFound[it.id] = s.itemsFound[it.id] || now;
    s.evoMoves = stamp(s.evoMoves);
    for (const id of Object.keys(G.Moves.EVO || {})) s.evoMoves[id] = s.evoMoves[id] || now;
    s.ach = stamp(s.ach);
    for (const a of G.AchDefs.LIST) s.ach[a.id] = s.ach[a.id] || now;
    s.skins = stamp(s.skins);
    for (const id of G.Skins.LIST) s.skins[id] = s.skins[id] || now;

    // Currency, gacha tickets, shop items
    s.coins = Math.max(s.coins || 0, COINS);
    s.tickets = Object.assign({ t1: 0, t10: 0 }, s.tickets);
    s.tickets.t1 = Math.max(s.tickets.t1, 999);
    s.tickets.t10 = Math.max(s.tickets.t10, 999);
    s.bag = stamp(s.bag);
    for (const id of Object.keys(G.Shop.ITEMS || {})) s.bag[id] = 999;

    s.admin = true;
    const saved = G.DB.commit();
    return { ok: true, saved };
  }

  function prompt() {
    const code = window.prompt('Admin passcode:');
    if (code == null) return;
    if (code.trim() !== PASSCODE) { G.UI.toast('Wrong passcode'); return; }
    const r = unlockAll();
    if (!r.ok) { G.UI.toast(r.error, 3500); return; }
    if (!r.saved) {
      // Nothing was written (guest, or storage full/blocked): reloading would throw the unlocks away.
      G.UI.toast('Unlocked for this session only: the save could not be stored', 3500);
      return;
    }
    G.UI.toast('Admin mode: everything unlocked!', 3500);
    setTimeout(() => location.reload(), 1200);
  }

  return { unlockAll, prompt, get on() { return !!(G.DB.save && G.DB.save.admin); } };
})();
