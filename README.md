# qg-scratch-editeur

Éditeur Scratch officiel (`@scratch/scratch-gui` **15.2.0**, version figée, licence AGPL-3.0, code source : https://github.com/scratchfoundation/scratch-editor) intégré au « QG des missions » (initiation Scratch 4e), publié sur GitHub Pages et chargé dans une iframe du QG.

| Fichier | Rôle |
|---|---|
| `index.html` + `pont.js` | l'éditeur et le pont `postMessage` avec le QG (commandes et événements décrits en tête de `pont.js`) |
| `gui/` | le bundle « standalone » du paquet npm, copié par `npm run gui` (sans les `.map`, chemin public corrigé pour `/qg-scratch-editeur/`) |
| `diagnostic.html` | page de diagnostic réseau (github.io, bibliothèque de lutins, IndexedDB, taille d'écran) |
| `test/qg-factice.html`, `outils/tester-pont.js` | `npm test` : pilote l'éditeur dans Chrome headless avec les projets de départ du QG |

Mise à jour de l'éditeur : changer la version dans `package.json`, `npm install`, `npm run gui`, `npm test` — jamais en pleine séquence.
