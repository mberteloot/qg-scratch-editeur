// Copie l'éditeur Scratch compilé (paquet npm @scratch/scratch-gui, version figée
// dans package.json) dans gui/, sans les .map, en corrigeant le chemin public :
// le bundle charge ses morceaux depuis « / », or GitHub Pages sert le site sous
// /qg-scratch-editeur/.
//   npm run gui
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'node_modules', '@scratch', 'scratch-gui', 'dist');
const CIBLE = path.join(__dirname, '..', 'gui');
const CHEMIN_PUBLIC = '/qg-scratch-editeur/gui/';
const IGNORES = ['types'];

let corriges = 0;
function copier(de, vers) {
  fs.mkdirSync(vers, { recursive: true });
  for (const nom of fs.readdirSync(de)) {
    if (IGNORES.includes(nom) || nom.endsWith('.map')) continue;
    const a = path.join(de, nom);
    const b = path.join(vers, nom);
    if (fs.statSync(a).isDirectory()) { copier(a, b); continue; }
    if (nom.endsWith('.js')) {
      const texte = fs.readFileSync(a, 'utf8');
      // __webpack_require__.p, et __nested_webpack_require_NNN__.p pour le fetch-worker de scratch-storage
      const nouveau = texte.replace(/(__(?:nested_)?webpack_require_*\d*__)\.p="\/"/g, '$1.p="' + CHEMIN_PUBLIC + '"');
      if (nouveau !== texte) corriges++;
      fs.writeFileSync(b, nouveau);
    } else {
      fs.copyFileSync(a, b);
    }
  }
}

fs.rmSync(CIBLE, { recursive: true, force: true });
copier(SOURCE, CIBLE);
const version = require(path.join(SOURCE, '..', 'package.json')).version;
fs.writeFileSync(path.join(CIBLE, 'VERSION.txt'), '@scratch/scratch-gui ' + version + '\n');
console.log('gui/ copié (scratch-gui ' + version + '), chemin public corrigé dans ' + corriges + ' fichier(s)');
