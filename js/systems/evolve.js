/* ============ evolve.js — evolución del compañero a mitad de partida ============
 * Copia personal (idea de PokéTide). En solitario, tu compañero evoluciona al
 * llegar a los niveles de LEVELS (como mucho, dos veces por partida), siguiendo
 * su línea real (data/evolutions.js, de PokeAPI). Con ramas (Eevee...) sale una
 * al azar. Si no tiene evolución, no pasa nada.
 *
 * Al evolucionar: sprite nuevo, stats base del nuevo (con la naturaleza de tu
 * compañero), +vida y un destello de evolución (ver Player.draw / evoFx). Las
 * mejoras, la habilidad, los ataques y el objeto se quedan como estaban. Lo
 * guardado (mejoras, más usados, ranking por Pokémon) sigue siendo del
 * compañero con el que empezaste (pl.partnerDex).
 */
G.Evolve = (() => {
  const LEVELS = [10, 20];
  /** Duración del destello (s). */
  const FX_TIME = 1.6;
  /** Vida extra al evolucionar, sobre la nueva vida máxima. */
  const HEAL = 0.25;

  /** Formas en las que puede evolucionar `dex` (sólo las que el juego tiene). */
  function options(dex) {
    return ((G.EVOS && G.EVOS[dex]) || []).filter(d => G.DEX_BY[d] && G.SPRITE_META[d] && !G.DEX_BY[d].leg);
  }

  /** Copia de G.DEX con la naturaleza del compañero (como G.Mons.monFor). */
  function monAs(dex, natureDex) {
    const base = G.DEX_BY[dex];
    const n = G.Mons.natureOf(natureDex), m = Object.assign({}, base);
    if (n.up) m[n.up] = base[n.up] * 1.1;
    if (n.down) m[n.down] = base[n.down] * 0.9;
    m.atk = Math.max(m.pa, m.sa);
    m.nature = n.id;
    return m;
  }

  /**
   * Cambia la forma del Pokémon (evolución, o el sandbox del admin).
   * Carga antes sus sprites; devuelve una promesa que acaba al cambiar.
   * @param opts { fx: destello y aviso, shiny: forzar shiny (si no, el de ahora) }
   */
  function become(pl, dex, opts = {}) {
    const to = G.DEX_BY[dex];
    if (!pl || !to) return Promise.resolve(false);
    const shiny = opts.shiny != null ? !!opts.shiny && G.Sprites.hasShiny(dex) : pl.shiny && G.Sprites.hasShiny(dex);
    const from = pl.mon;
    return G.Sprites.preload([dex], 8000, shiny).then(() => {
      if (pl !== G.Game.player) return false;          // la partida acabó mientras cargaba
      const mon = monAs(dex, pl.partnerDex || pl.dex);
      const oldAnim = pl.anim;
      pl.mon = mon; pl.dex = dex; pl.shiny = shiny;
      pl.scale = G.Sprites.playerScale(dex);
      pl.anim = new G.Sprites.Animator(dex, pl.scale, shiny);
      pl.anim.skin = null;                              // los disfraces son de una forma concreta
      pl.r = G.Sprites.playerRadius(dex);
      pl.bodyH = G.Sprites.bodyHeight(dex, pl.scale);
      // Stats: la diferencia de vida base se suma (las mejoras siguen igual).
      const dHp = Math.round(mon.hp - from.hp);
      pl.maxHp = Math.max(1, pl.maxHp + dHp);
      pl.hp = Math.min(pl.maxHp, Math.max(1, pl.hp + Math.max(0, dHp)));
      pl.baseSpd = mon.spd;
      pl.baseAtk = mon.atk;
      if (opts.fx) {
        pl.evoOld = oldAnim; pl.evoFx = FX_TIME;
        pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * HEAL);
        pl.invuln = Math.max(pl.invuln, FX_TIME + 0.5);
        G.Game.flash('#ffffff', 0.7);
        for (let i = 0; i < 3; i++) G.FX.ring(pl.x, pl.y - pl.bodyH / 2, 8 + i * 6, 90 + i * 40, i ? '#9fe8ff' : '#ffffff', 0.8, 4 + i);
        G.Audio.sfx('levelup');
        G.Spawner.say(from.name + ' evolved into ' + mon.name + '!', 3.4, true);
      }
      return true;
    });
  }

  /**
   * Tras cada subida de nivel (en solitario): evoluciona si toca. Una etapa
   * cada vez; el destello no se pisa con otro.
   */
  function check(pl) {
    if (!pl || pl.dead || G.Coop.active) return;
    pl.evoStage = pl.evoStage || 0;
    if (pl.evoStage >= LEVELS.length || pl.level < LEVELS[pl.evoStage] || pl.evoBusy) return;
    pl.evoStage++;
    const opts = options(pl.dex);
    if (!opts.length) return;                            // sin evolución: no pasa nada
    pl.evoBusy = true;
    api.become(pl, G.U.pick(opts), { fx: true }).then(ok => {
      pl.evoBusy = false;
      if (ok) pl.evolutions = (pl.evolutions || 0) + 1;
    }, () => { pl.evoBusy = false; });
  }

  const api = { LEVELS, options, become, check, monAs };
  return api;
})();
