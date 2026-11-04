// Teste le pont QG ↔ éditeur dans Chrome headless : serveur local qui imite
// GitHub Pages (/qg-scratch-editeur/…) et sert les projets de départ du QG (/departs/…).
//   npm test            (CHROME=… pour un autre chemin de Chrome)
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RACINE = path.join(__dirname, '..');
const DEPARTS = path.join(RACINE, '..', '4e-initiation-scratch', 'departs');
const PORT = 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.css': 'text/css', '.sb3': 'application/octet-stream', '.wasm': 'application/wasm' };

const serveur = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let fichier = null;
  if (url.startsWith('/qg-scratch-editeur/')) fichier = path.join(RACINE, url.slice('/qg-scratch-editeur/'.length) || 'index.html');
  else if (url.startsWith('/departs/')) fichier = path.join(DEPARTS, url.slice('/departs/'.length));
  if (!fichier || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
  fs.createReadStream(fichier).pipe(res);
});

let echecs = 0;
function verifier(nom, condition, detail) {
  console.log((condition ? '  ✔ ' : '  ✘ ') + nom + (condition || !detail ? '' : ' : ' + detail));
  if (!condition) echecs++;
}

(async () => {
  await new Promise(ok => serveur.listen(PORT, ok));
  const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 1366, height: 650 });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    const debut = Date.now();
    await page.goto(`http://localhost:${PORT}/qg-scratch-editeur/test/qg-factice.html`);
    await page.waitForFunction(() => window.evenements.includes('pret'), { timeout: 60000 });
    verifier('éditeur prêt en ' + Math.round((Date.now() - debut) / 1000) + ' s', true);

    await page.evaluate(() => window.chargerDepart('M5-attention-bombe.sb3', 'test@x:M5'));
    let r = await page.evaluate(() => window.commande('projet'));
    const projet = JSON.parse(r.json);
    verifier('départ M5 chargé (' + projet.targets.length + ' cibles)', projet.targets.length > 1);
    verifier('pas encore exécuté', r.execute === false);

    const frame = page.frames().find(f => f.url().includes('/qg-scratch-editeur/index.html'));
    await frame.click('img[class*="green-flag"]');
    await page.waitForFunction(() => window.evenements.includes('execute'), { timeout: 5000 }).catch(() => {});
    r = await page.evaluate(() => window.commande('projet'));
    verifier('drapeau vert → exécuté', r.execute === true);
    await frame.click('img[class*="stop-all"]');

    await frame.evaluate(() => window.vmQG.runtime.emitProjectChanged());
    await page.waitForFunction(() => window.evenements.includes('modifie'), { timeout: 5000 }).catch(() => {});
    r = await page.evaluate(() => window.commande('projet'));
    verifier('modification → à réexécuter', r.execute === false);

    r = await page.evaluate(() => window.commande('sauver'));
    verifier('sauvegarde dans le navigateur', typeof r.date === 'number');
    r = await page.evaluate(() => window.commande('sauvegarde', { cle: 'test@x:M5' }));
    verifier('date de la sauvegarde relue', typeof r.date === 'number');

    await page.evaluate(() => window.chargerDepart('M1-deplacer-hector.sb3', 'test@x:M1'));
    r = await page.evaluate(() => window.commande('reprendre', { cle: 'test@x:M5' }));
    const repris = JSON.parse((await page.evaluate(() => window.commande('projet'))).json);
    verifier('reprise de la sauvegarde M5', r.trouve === true && repris.targets.length === projet.targets.length);
    r = await page.evaluate(() => window.commande('reprendre', { cle: 'inconnue' }));
    verifier('reprise sans sauvegarde → trouve: false', r.trouve === false);

    r = await page.evaluate(() => window.commande('sb3').then(x => x.sb3.byteLength));
    verifier('export .sb3 (' + Math.round(r / 1024) + ' Ko)', r > 1000);

    r = await page.evaluate(() => window.commande('nimporte').then(() => 'ok', e => e.message));
    verifier('commande inconnue refusée', /inconnue/.test(r));

    await page.screenshot({ path: path.join(RACINE, 'test', 'capture-1366x650.png') });
    verifier('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  } finally {
    await navigateur.close();
    serveur.close();
  }
  console.log(echecs ? echecs + ' échec(s)' : 'Tous les tests passent');
  process.exit(echecs ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
