#!/usr/bin/env python3
"""build_evolutions.py — genera js/data/evolutions.js (copia personal).

Lee las tablas públicas de PokeAPI (pokemon_species.csv: evolves_from_species_id)
una sola vez y deja en el juego qué Pokémon evoluciona en cuál, para la
evolución a mitad de partida (systems/evolve.js). El juego no pide nada a
internet: sólo este script, al regenerar el archivo.

Sólo entran parejas en las que los dos están en G.DEX, tienen sprites en
assets/pokemon/<dex>/ y ninguno es legendario/singular.

    python3 -I tools/build_evolutions.py [carpeta-de-cache]
"""
import csv, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.cache-pokeapi')
URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species.csv'


def species_rows():
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, 'pokemon_species.csv')
    if not os.path.exists(path):
        urllib.request.urlretrieve(URL, path)
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def game_dex():
    src = open(os.path.join(ROOT, 'js/data/pokedex.js'), encoding='utf-8').read()
    out = {}
    for line in src.splitlines():
        m = re.search(r'\{"dex":(\d+).*\}', line)
        if m:
            e = json.loads(m.group(0))
            out[e['dex']] = e
    return out


def main():
    dex = game_dex()
    evos, dropped = {}, 0
    for r in species_rows():
        frm = r['evolves_from_species_id']
        if not frm:
            continue
        a, b = int(frm), int(r['id'])
        if a not in dex or b not in dex or dex[a].get('leg') or dex[b].get('leg'):
            continue
        if not all(os.path.isdir(os.path.join(ROOT, 'assets/pokemon', str(d))) for d in (a, b)):
            dropped += 1
            continue
        evos.setdefault(a, []).append(b)
    lines = [f'  {a}: [{", ".join(str(x) for x in sorted(v))}],' for a, v in sorted(evos.items())]
    body = '\n'.join(lines).rstrip(',')
    js = ('/* ============ evolutions.js — GENERADO, no editar a mano ============\n'
          ' * Lo produce tools/build_evolutions.py con los datos públicos de PokeAPI\n'
          ' * (pokemon_species.csv). G.EVOS[dex] = en qué evoluciona; G.EVO_FROM[dex] = de\n'
          ' * qué viene. Sólo Pokémon del juego, con sprites y no legendarios.\n'
          ' */\n'
          'G.EVOS = {\n' + body + '\n};\n'
          'G.EVO_FROM = {};\n'
          'for (const a in G.EVOS) for (const b of G.EVOS[a]) G.EVO_FROM[b] = +a;\n')
    open(os.path.join(ROOT, 'js/data/evolutions.js'), 'w', encoding='utf-8', newline='\n').write(js)
    pairs = sum(len(v) for v in evos.values())
    print(f'ok: {pairs} evolutions from {len(evos)} species, {dropped} dropped (no sprites)')


if __name__ == '__main__':
    main()
