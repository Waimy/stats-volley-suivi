// Version du schéma de données : les sauvegardes de l'app 1.0.x (sans champ schema) sont reconnues comme schéma 1, sans rien perdre.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { creerApp } = require('./env');
const o = require('./outils');

const CLE = 'statsvolley.v1';
const brut = (x) => JSON.parse(JSON.stringify(x));
// Sauvegarde exportée par l'app 1.0.0 : 12 joueurs, un match de 3 sets avec remplacement, libéro, correction, temps mort.
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sauvegarde-1.0.0.json'), 'utf8'));
// Résumé recalculé d'un match : score de chaque set, sets gagnés, totaux de stats.
const resume = (env, m) => {
  const ms = env.ctx.matchState(m), S = env.ctx.computeStats(m, 'all');
  return brut({ sets: ms.states.map((st) => [st.nous, st.adv, st.subs, [...st.pos]]), w: ms.w, T: S.T, P: S.P });
};

test('la sauvegarde de référence n\'a pas de champ schema', () => {
  assert.equal(FIXTURE.version, '1.0.0');
  assert.ok(!('schema' in FIXTURE.db));
});

test('chargement d\'une base 1.0.x depuis le stockage local : schéma 1, rien de perdu', () => {
  const env = creerApp({ stockage: { [CLE]: JSON.stringify(FIXTURE.db) } });
  assert.equal(env.db.schema, 1);
  for (const k of Object.keys(FIXTURE.db)) if (k !== 'settings') assert.deepEqual(brut(env.db[k]), FIXTURE.db[k], k);
  for (const k of Object.keys(FIXTURE.db.settings)) if (k !== 'layouts') assert.deepEqual(brut(env.db.settings[k]), FIXTURE.db.settings[k], 'réglage ' + k);
  for (const k of Object.keys(FIXTURE.db.settings.layouts || {})) assert.deepEqual(brut(env.db.settings.layouts[k]), FIXTURE.db.settings.layouts[k], 'disposition ' + k);
  // Les recalculs donnent la même chose qu'avec l'app 1.0.0.
  const ref = creerApp();
  const m0 = brut(FIXTURE.db.matches[0]);
  ref.evaluer('db').players = brut(FIXTURE.db.players);
  assert.deepEqual(resume(env, env.db.matches[0]), resume(ref, m0));
  o.verifierMatch(env, env.db.matches[0], { complet: true, ctx: 'fixture' });

  // On continue à saisir : la base enregistrée garde tout, avec schema = 1.
  assert.equal(env.ui.view, 'live');
  o.point(env, 'gagne', 'inconnue-inconnu');
  const stocke = JSON.parse(env.store[CLE]);
  assert.equal(stocke.schema, 1);
  assert.deepEqual(stocke.players, FIXTURE.db.players);
  assert.deepEqual(stocke.matches[0].sets.slice(0, 2), FIXTURE.db.matches[0].sets.slice(0, 2));
  assert.equal(stocke.matches[0].sets[2].events.length, FIXTURE.db.matches[0].sets[2].events.length + 1);
});

test('import d\'une sauvegarde 1.0.x : schéma 1, rien de perdu', () => {
  const env = creerApp();
  env.act('go', 'historique');
  env.change({ id: 'imp-file', files: [{ name: 'ancienne.json', contenu: JSON.stringify(FIXTURE) }] });
  assert.equal(env.ui.err, '');
  assert.equal(env.ui.imp.db.schema, 1);
  env.act('imp-replace');
  assert.equal(env.db.schema, 1);
  assert.deepEqual(brut(env.db.matches), FIXTURE.db.matches);
  assert.deepEqual(brut(env.db.players), FIXTURE.db.players);
  const fusion = creerApp();
  fusion.act('go', 'historique');
  fusion.change({ id: 'imp-file', files: [{ name: 'ancienne.json', contenu: JSON.stringify(FIXTURE) }] });
  fusion.act('imp-merge');
  assert.equal(fusion.db.schema, 1);
  assert.deepEqual(brut(fusion.db.matches), FIXTURE.db.matches);
});

test('les nouvelles bases et les exports portent le schéma courant', () => {
  const env = creerApp();
  assert.equal(env.db.schema, 1, 'base vide du premier lancement');
  env.act('try-example');
  assert.equal(env.db.schema, 1, 'exemple');
  env.act('export');
  assert.equal(JSON.parse(env.exports[0].contenu).db.schema, 1, 'export');
  env.act('empty-yes');
  assert.equal(env.db.schema, 1, 'repartir de zéro');
});

test('migrer : sans effet sur une base à jour, tolère l\'absence de base', () => {
  const env = creerApp();
  const migrer = env.evaluer('migrer');
  assert.equal(migrer(null), null);
  const d = { schema: 1, players: [], matches: [] };
  assert.deepEqual(brut(migrer(d)), { schema: 1, players: [], matches: [] });
  assert.equal(env.evaluer('SCHEMA'), 1);
});

test('une sauvegarde d\'une version plus récente est refusée à l\'import, et conservée au chargement', () => {
  const future = brut(FIXTURE.db);
  future.schema = 99;
  const env = creerApp();
  env.act('go', 'historique');
  env.change({ id: 'imp-file', files: [{ name: 'future.json', contenu: JSON.stringify({ app: 'stats-volley', db: future }) }] });
  assert.match(env.ui.err, /version plus récente/);
  assert.equal(env.ui.imp, null);
  const env2 = creerApp({ stockage: { [CLE]: JSON.stringify(future) } });
  assert.equal(env2.db.schema, 99, 'base laissée telle quelle, pas de plantage');
  assert.equal(env2.db.matches.length, 1);
});
