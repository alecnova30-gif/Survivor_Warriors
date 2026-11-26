# 🌍 Terra Vive

Un jeu de survie / créatif en monde ouvert **sans blocs** : un vaste terrain 3D lisse
et naturel (collines arrondies, falaises, grottes, plages, océans), généré
procéduralement et **sculptable à volonté** — creuse partout, construis des
monticules et des murs lisses, comme de la vraie terre.

Fait avec [Three.js](https://threejs.org) (WebGL), sans blocs : le terrain est une
surface continue (mailles « surface nets » sur un champ de densité 3D) avec
normales lisses, ombres douces, cycle jour/nuit, ciel dynamique et eau animée.

## Lancer le jeu

Les modules ES nécessitent un serveur HTTP (pas d'ouverture directe du fichier) :

```bash
cd game
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

ou :

```bash
npx serve game
```

## Biomes

Prairie, forêt (chênes, bouleaux), forêt dense, savane, désert (cactus),
toundra enneigée (sapins), montagnes rocheuses aux sommets enneigés, marais,
plages et océans. Sous terre : tunnels et grandes cavernes.

## Gameplay

- **Miner / creuser** n'importe où (terre, pierre, sable, neige) — la matière
  récoltée dépend de la profondeur et du biome, avec charbon, fer et or.
- **Construire** avec la terre, la pierre, le sable, les planches, le bois…
- **Récolter** : arbres (bois, pousses), buissons à baies, rochers, minerais.
- **Crafter** : planches, bâtons, torches, feu de camp, outils en bois /
  pierre / fer (pioche, hache, pelle, épée).
- **Mobs** : lapins et cerfs (chasse), loups et zombies (combat la nuit).
- **Survie** : vie, faim, chutes, noyade, mort et réapparition.
- **Créatif** : vol, minage instantané, ressources infinies.
- **Sauvegarde** automatique locale du monde (modifications du terrain incluses).

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD | Se déplacer |
| Espace | Sauter / nager / monter (vol) |
| Maj | Sprinter |
| Clic gauche | Miner, attaquer, récolter |
| Clic droit | Construire, manger, planter, poser une torche |
| Molette / 1–9 | Changer d'objet |
| E | Inventaire & fabrication |
| F | Voler (mode créatif) |
| M | Survie ↔ Créatif |
| F3 | Infos de debug |
| Échap | Pause |

## Architecture

```
game/
├── index.html          Interface, HUD, styles
└── src/
    ├── main.js         Assemblage du jeu, boucle, sauvegarde
    ├── noise.js        Bruit simplex + fBm
    ├── worldgen.js     Biomes, hauteur, grottes, champ de densité, couleurs
    ├── surfacenets.js  Maillage de surface lisse (surface nets)
    ├── worker.js       Génération des chunks dans des Web Workers
    ├── chunks.js       Gestion des chunks + édition du terrain
    ├── environment.js  Ciel, soleil, lune, eau, nuages, cycle jour/nuit
    ├── features.js     Arbres, rochers, minerais, buissons, torches…
    ├── mobs.js         Animaux et monstres (IA, combat)
    ├── player.js       Contrôles, physique, interactions, survie/créatif
    ├── items.js        Objets, recettes, inventaire
    ├── ui.js           HUD, inventaire, craft, particules, items au sol
    └── sound.js        Sons synthétisés (WebAudio)
```
