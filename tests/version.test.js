// Cohérence des versions et du cache hors ligne : tout fichier chargé par la page doit être dans le cache du service worker.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { RACINE } = require('./env');

const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

function serviceWorker() {
  const ctx = vm.createContext({ self: { addEventListener() {}, location: { origin: 'https://exemple.test' } } });
  vm.runInContext(lire('sw.js'), ctx);
  return { V: vm.runInContext('V', ctx), VERSION: vm.runInContext('VERSION', ctx), CORE: [...vm.runInContext('CORE', ctx)] };
}
// Fichiers locaux chargés par index.html (styles, scripts, manifeste, icônes).
function ressourcesDeLaPage() {
  const html = lire('index.html');
  return [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
}

test('VERSION de sw.js, APP_VERSION et les ?v= de index.html concordent', () => {
  const { V, VERSION } = serviceWorker();
  assert.equal(VERSION, 'sv-' + V);
  const app = /const APP_VERSION='([^']+)'/.exec(lire('js/interface.js'));
  assert.ok(app, 'APP_VERSION introuvable dans js/interface.js');
  assert.equal(app[1], V, 'APP_VERSION ≠ version du service worker');
  const versions = ressourcesDeLaPage().filter((u) => u.includes('?v=')).map((u) => u.split('?v=')[1]);
  assert.ok(versions.length >= 4, 'styles et scripts versionnés');
  versions.forEach((v) => assert.equal(v, V, '?v= de index.html ≠ version du service worker'));
});

test('tout ce que charge la page est dans le cache hors ligne, et existe', () => {
  const { CORE } = serviceWorker();
  for (const u of ressourcesDeLaPage()) {
    if (u === 'sw.js') continue;
    assert.ok(CORE.includes('./' + u), u + ' absent de CORE dans sw.js');
  }
  for (const u of CORE) {
    if (u === './') continue;
    const f = u.slice(2).split('?')[0];
    assert.ok(fs.existsSync(path.join(RACINE, f)), u + ' : fichier introuvable');
  }
  ['./', './index.html', './styles.css', './js/moteur.js', './js/stats.js', './js/interface.js']
    .forEach((f) => assert.ok(CORE.some((u) => u.split('?')[0] === f), f + ' absent de CORE'));
});

test('le moteur et les stats se chargent seuls, sans DOM', () => {
  const ctx = vm.createContext({});
  vm.runInContext(lire('js/moteur.js'), ctx, { filename: 'js/moteur.js' });
  vm.runInContext(lire('js/stats.js'), ctx, { filename: 'js/stats.js' });
  vm.runInContext('var db; db = seed();', ctx);
  const res = vm.runInContext('const m = db.matches[0], st = replay(m, m.sets[0]); [st.nous, st.adv, computeStats(m, "all").T.won]', ctx);
  assert.deepEqual([...res], [6, 5, 6]);
});
