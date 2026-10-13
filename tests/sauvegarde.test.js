// g) Sauvegarde : persistance locale, export, import (fusion sans doublon, remplacement), fichier invalide refusé.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApp } = require('./env');
const o = require('./outils');

const CLE = 'statsvolley.v1';
const brut = (x) => JSON.parse(JSON.stringify(x));

// Un appareil avec une équipe et un match d'un set terminé.
function appareilAvecMatch(adversaire = 'Club A') {
  const env = creerApp();
  o.creerEquipe(env, 10, 1);
  const m = o.nouveauMatch(env, { adversaire });
  const { joueurs, liberos } = o.effectif(m);
  o.demarrerSet(env, joueurs.slice(0, 6), { libero: liberos[0] });
  o.point(env, 'gagne', 'ace-nous');
  env.act('lib-in', o.etat(env).pos[4]);
  o.finirSet(env, 25, 18);
  return env;
}
function exporter(env) {
  const n = env.exports.length;
  env.act('export');
  assert.equal(env.exports.length, n + 1, 'un fichier est produit');
  return env.exports[n];
}
function importer(env, fichier) {
  env.act('go', 'historique');
  env.change({ id: 'imp-file', files: [fichier] });
}
const fichierTexte = (contenu) => ({ name: 'test.json', contenu });

test('les données survivent à un rechargement de la page', () => {
  const env = appareilAvecMatch();
  const env2 = creerApp({ stockage: env.store });
  for (const k of ['players', 'matches', 'teamName', 'currentMatchId', 'exemple']) assert.deepEqual(brut(env2.db[k]), brut(env.db[k]), k);
  assert.equal(env2.ui.view, 'compo', 'set terminé : on reprend à la composition du set suivant');
});

test('l\'export contient toute la base et date la dernière sauvegarde', () => {
  const env = appareilAvecMatch();
  const avant = brut(env.db);
  const f = exporter(env);
  assert.match(f.name, /^stats-volley-\d{4}-\d{2}-\d{2}\.json$/);
  const o2 = JSON.parse(f.contenu);
  assert.equal(o2.app, 'stats-volley');
  assert.equal(o2.format, 1);
  assert.equal(o2.version, env.evaluer('APP_VERSION'));
  assert.ok(!Number.isNaN(Date.parse(o2.exportedAt)));
  assert.deepEqual(o2.db, avant);
  assert.ok(env.db.lastExport > 0);
  assert.match(env.ui.flash, /Sauvegarde téléchargée/);
});

test('import « Ajouter ce qui manque » : fusion sans doublon', () => {
  const A = appareilAvecMatch('Club A');
  const fichierA = exporter(A);

  // Appareil B : part de la sauvegarde de A (mêmes joueurs), puis joue un autre match.
  const B = creerApp();
  importer(B, fichierA);
  assert.equal(B.ui.err, '');
  assert.equal(B.ui.imp.db.players.length, 10);
  assert.match(B.html, /Fichier lu :<\/b> 10 joueurs, 1 matchs/);
  B.act('imp-merge');
  assert.match(B.ui.flash, /10 joueurs et 1 match ajoutés/);
  const m2 = o.nouveauMatch(B, { adversaire: 'Club B' });
  o.demarrerSet(B, o.effectif(m2).joueurs.slice(0, 6));
  o.finirSet(B, 10, 25);

  // Retour sur A : on importe la sauvegarde de B.
  importer(A, exporter(B));
  A.act('imp-merge');
  assert.match(A.ui.flash, /0 joueur et 1 match ajoutés/);
  assert.equal(A.db.players.length, 10, 'pas de joueur en double');
  assert.deepEqual([...A.db.matches.map((m) => m.adversaire)].sort(), ['Club A', 'Club B']);

  // Réimporter le même fichier n'ajoute rien.
  importer(A, exporter(B));
  A.act('imp-merge');
  assert.match(A.ui.flash, /0 joueur et 0 match ajoutés/);
  assert.equal(A.db.matches.length, 2);
  A.db.matches.forEach((m) => o.verifierMatch(A, m, { complet: true, ctx: m.adversaire }));

  // La fusion est enregistrée.
  assert.equal(JSON.parse(A.store[CLE]).matches.length, 2);
});

test('import « Tout remplacer »', () => {
  const A = appareilAvecMatch('Club A');
  const f = exporter(A);
  const B = creerApp();
  o.creerEquipe(B, 7, 0);
  importer(B, f);
  B.act('imp-replace');
  assert.deepEqual(brut(B.db.matches), brut(A.db.matches));
  assert.deepEqual(brut(B.db.players), brut(A.db.players));
  assert.equal(B.db.welcome, false);
  assert.match(B.ui.flash, /Données remplacées/);
});

test('une base brute (sans enveloppe d\'export) est acceptée', () => {
  const A = appareilAvecMatch();
  const B = creerApp();
  importer(B, fichierTexte(JSON.stringify(A.db)));
  assert.equal(B.ui.err, '');
  assert.equal(B.ui.imp.db.matches.length, 1);
});

test('fichier invalide refusé, rien n\'est modifié', () => {
  const A = appareilAvecMatch();
  const avant = brut(A.db);
  for (const contenu of ['pas du json', 'null', '42', '{"app":"autre"}', '{"db":{"players":[],"matches":{}}}',
    '{"db":{"players":[],"matches":[{"sets":[]}]}}', '{"players":"x","matches":[]}']) {
    importer(A, fichierTexte(contenu));
    assert.equal(A.ui.err, 'Ce fichier n\'est pas une sauvegarde Stats volley valide.', contenu);
    assert.equal(A.ui.imp, null, contenu);
    assert.ok(!A.boutons().some((b) => b.a === 'imp-merge'), contenu);
  }
  assert.deepEqual(brut(A.db), avant);
});
