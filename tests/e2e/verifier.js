// Vérification de bout en bout dans un vrai navigateur (Chromium, Playwright), en taille iPhone puis iPad paysage.
// Parcours : premier lancement, exemple, saisie de points, fin de set, compte rendu, rechargement hors ligne, export, import.
//
// Ne fait pas partie de `node --test` (il faut un navigateur). Pour le lancer :
//   npm install --no-save playwright && npx playwright install chromium
//   node tests/e2e/verifier.js            (CAPTURES=dossier pour garder des captures d'écran)
// Si le Chromium de Playwright ne peut pas se lancer (poste verrouillé) : NAVIGATEUR=chrome ou NAVIGATEUR=msedge
// utilise le navigateur installé.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const RACINE = path.join(__dirname, '..', '..');
const CAPTURES = process.env.CAPTURES || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

// Serveur statique minimal (équivalent de python3 -m http.server).
function serveur() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(RACINE, p);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

const FORMATS = [
  { nom: 'iPhone 390 px', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { nom: 'iPad paysage 1180 px', viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

async function nouvelAppareil(browser, format) {
  const context = await browser.newContext({ viewport: format.viewport, isMobile: format.isMobile, hasTouch: format.hasTouch, deviceScaleFactor: format.deviceScaleFactor, acceptDownloads: true });
  // Pas de feuille de partage dans le navigateur de test : l'export passe par un téléchargement.
  await context.addInitScript(() => { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) {} });
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) erreurs.push(m.text()); });
  return { context, page, erreurs };
}

async function verifierMiseEnPage(page, etape) {
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(debord <= 0, etape + ' : défilement horizontal de ' + debord + ' px');
  const html = await page.locator('#app').innerHTML();
  assert.ok(!/undefined|NaN/.test(html), etape + ' : « undefined » ou « NaN » affiché');
}
async function capture(page, format, nom) {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, format.nom.replace(/\W+/g, '-') + '-' + nom + '.png'), fullPage: true });
}
const score = async (page) => (await page.locator('.score .pts').allTextContents()).map(Number);

async function parcours(browser, base, format) {
  const etapes = [];
  const ok = (e) => { etapes.push(e); console.log('  ✔ ' + e); };
  const { context, page, erreurs } = await nouvelAppareil(browser, format);

  // 1. Premier lancement.
  await page.goto(base);
  await page.getByRole('heading', { name: 'L\'effectif' }).waitFor();
  await page.getByText('Bienvenue').waitFor();
  await verifierMiseEnPage(page, 'premier lancement');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await capture(page, format, '1-premier-lancement');
  ok('premier lancement, service worker actif');

  // 2. Exemple.
  await page.getByRole('button', { name: 'Essayer avec un exemple' }).click();
  await page.locator('.score').waitFor();
  assert.deepEqual(await score(page), [6, 5]);
  await verifierMiseEnPage(page, 'exemple');
  await capture(page, format, '2-exemple');
  ok('exemple chargé (6–5)');

  // 3. Quelques points.
  await page.locator('[data-a="res"][data-v="gagne"]').click();
  await page.locator('[data-a="opt"][data-v="attaqueGagnante-nous"]').click();
  await page.locator('[data-a="joueur"]:not([disabled])').first().click();
  assert.deepEqual(await score(page), [7, 5]);
  await page.locator('[data-a="res"][data-v="perdu"]').click();
  await page.locator('[data-a="opt"]:not([disabled])').first().click();
  const joueur = page.locator('[data-a="joueur"]:not([disabled])');
  if (await joueur.count()) await joueur.first().click();
  assert.deepEqual(await score(page), [7, 6]);
  await page.locator('[data-a="undo"]').first().click();
  assert.deepEqual(await score(page), [7, 5]);
  await verifierMiseEnPage(page, 'saisie');
  await capture(page, format, '3-saisie');
  ok('saisie de points et annulation');

  // 4. Fin de set.
  for (let k = 0; k < 40 && await page.locator('[data-a="res"]').count(); k++) {
    await page.locator('[data-a="res"][data-v="gagne"]').click();
    await page.locator('[data-a="opt"][data-v="inconnue-inconnu"]').click();
  }
  await page.getByText(/Set 1 terminé 25–5/).waitFor();
  ok('fin de set à 25–5');

  // 5. Compte rendu.
  for (const t of ['À retenir', 'Chiffres clés', 'Où on perd des points']) await page.locator('.w-t', { hasText: t }).waitFor();
  await verifierMiseEnPage(page, 'compte rendu');
  await capture(page, format, '4-compte-rendu');
  await page.getByRole('button', { name: 'Tableau détaillé par joueur' }).click();
  await page.getByRole('heading', { name: 'Par joueur' }).waitFor();
  await verifierMiseEnPage(page, 'stats détaillées');
  ok('compte rendu et stats détaillées');

  // 6. Rechargement hors ligne.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Le six de départ' }).waitFor();
  await page.getByText(/Set 1 gagné 25–5/).waitFor();
  const styles = await page.evaluate(() => getComputedStyle(document.querySelector('.appbar')).position);
  assert.equal(styles, 'sticky', 'feuille de styles chargée hors ligne');
  await verifierMiseEnPage(page, 'hors ligne');
  await capture(page, format, '5-hors-ligne');
  await context.setOffline(false);
  ok('rechargement hors ligne : app, styles et données présents');

  // 7. Export.
  await page.getByRole('button', { name: 'Historique' }).click();
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter une sauvegarde' }).click()]);
  const fichier = path.join(os.tmpdir(), 'sv-e2e-' + Date.now() + '.json');
  await telechargement.saveAs(fichier);
  const sauvegarde = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.equal(sauvegarde.app, 'stats-volley');
  assert.equal(sauvegarde.db.matches.length, 1);
  assert.equal(sauvegarde.db.players.length, 12);
  assert.equal(sauvegarde.db.schema, 1);
  assert.equal(sauvegarde.version, await page.evaluate(() => APP_VERSION));
  ok('export (' + telechargement.suggestedFilename() + ')');

  // 8. Import sur un autre appareil : fichier invalide refusé, puis fusion.
  const autre = await nouvelAppareil(browser, format);
  await autre.page.goto(base);
  await autre.page.getByRole('button', { name: 'Historique' }).click();
  const invalide = path.join(os.tmpdir(), 'sv-e2e-invalide.json');
  fs.writeFileSync(invalide, '{"pas":"une sauvegarde"}');
  await autre.page.locator('#imp-file').setInputFiles(invalide);
  await autre.page.getByText('Ce fichier n\'est pas une sauvegarde Stats volley valide.').waitFor();
  await autre.page.locator('#imp-file').setInputFiles(fichier);
  await autre.page.getByText(/Fichier lu :/).waitFor();
  await autre.page.getByRole('button', { name: 'Ajouter ce qui manque' }).click();
  await autre.page.getByText(/Import terminé : 12 joueurs et 1 match ajoutés/).waitFor();
  await autre.page.getByRole('heading', { name: 'Volley Club Exemple' }).waitFor();
  await verifierMiseEnPage(autre.page, 'import');
  await capture(autre.page, format, '6-import');
  ok('import : fichier invalide refusé, fusion réussie');

  assert.deepEqual(erreurs.concat(autre.erreurs), [], 'erreurs JavaScript');
  ok('aucune erreur JavaScript');
  await autre.context.close();
  await context.close();
  return etapes.length;
}

(async () => {
  const srv = await serveur();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch(process.env.NAVIGATEUR ? { channel: process.env.NAVIGATEUR } : {});
  let echec = false;
  for (const format of FORMATS) {
    console.log(format.nom);
    try { await parcours(browser, base, format); } catch (e) { echec = true; console.error('  ✖ ' + e.message); }
  }
  await browser.close();
  srv.close();
  process.exit(echec ? 1 : 0);
})();
