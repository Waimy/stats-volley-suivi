// a) Un match officiel joué de bout en bout : score, rotations, fins de set, set décisif, fin de match.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApp } = require('./env');
const o = require('./outils');

// Rotation attendue, recalculée indépendamment du moteur : une rotation par point gagné sur service adverse.
function rotationsAttendues(set) {
  let service = set.serviceInitial, n = 0;
  for (const ev of set.events) {
    if (ev.type !== 'point') continue;
    if (ev.resultat === 'gagne') { if (service === 'adv') n++; service = 'nous'; } else service = 'adv';
  }
  return n;
}
const tourner = (f, n) => f.map((_, i) => f[(i + n) % 6]);

test('match officiel complet en 5 sets', () => {
  const env = creerApp();
  o.creerEquipe(env, 10, 1);
  const m = o.nouveauMatch(env);
  const { joueurs, liberos } = o.effectif(m);
  const F = joueurs.slice(0, 6);

  // Set 1 : on sert.
  o.demarrerSet(env, F, { libero: liberos[0], service: 'nous' });
  let st = o.etat(env);
  assert.equal(st.cible, 25);
  assert.deepEqual(st.pos, F);

  o.point(env, 'gagne', 'ace-nous');                  // 1–0, on garde le service, pas de rotation
  st = o.etat(env);
  assert.deepEqual([st.nous, st.adv, st.service], [1, 0, 'nous']);
  assert.deepEqual(st.pos, F);
  assert.equal(m.sets[0].events[0].joueurID, F[0], 'ace attribué au serveur');

  o.point(env, 'perdu', 'attaqueGagnante-adversaire'); // 1–1, service adverse, pas de rotation
  st = o.etat(env);
  assert.deepEqual([st.nous, st.adv, st.service], [1, 1, 'adv']);
  assert.deepEqual(st.pos, F);

  o.point(env, 'gagne', 'attaqueGagnante-nous', { joueur: F[2] }); // 2–1, side-out : rotation
  st = o.etat(env);
  assert.deepEqual([st.nous, st.adv, st.service], [2, 1, 'nous']);
  assert.deepEqual(st.pos, tourner(F, 1), 'zone 2 passe en zone 1');
  assert.equal(m.sets[0].events[2].joueurID, F[2]);

  o.point(env, 'gagne', 'ace-nous');
  assert.equal(m.sets[0].events[3].joueurID, F[1], 'le nouveau serveur est l\'ancien joueur de zone 2');

  o.finirSet(env, 24, 20);
  assert.equal(env.ui.view, 'live', 'le set continue à 24–20');
  o.point(env, 'gagne', 'inconnue-inconnu');
  st = o.etat(env);
  assert.ok(st.ended);
  assert.deepEqual([st.nous, st.adv], [25, 20]);
  assert.deepEqual(st.pos, tourner(F, rotationsAttendues(m.sets[0]) % 6));
  assert.equal(env.ui.view, 'rapport', 'compte rendu ouvert à la fin du set');
  assert.match(env.ui.flash, /Set 1 terminé 25–20/);
  assert.ok(!env.boutons().some((b) => b.a === 'res'), 'plus de saisie possible après la fin du set');
  o.verifierMatch(env, m, { complet: true, ctx: 'set 1' });

  // Set 2 : le service alterne, la composition précédente est reprise.
  env.act('next-set');
  assert.equal(env.ui.view, 'compo');
  assert.equal(env.ui.compo.service, 'adv');
  assert.deepEqual(env.ui.compo.slots, F);
  o.demarrerSet(env, F, { libero: liberos[0], service: 'adv' });
  o.finirSet(env, 23, 25);
  assert.equal(env.ui.view, 'rapport');

  // Set 3 : prolongation à 27–25 (2 points d'écart).
  env.act('next-set');
  o.demarrerSet(env, F, { libero: liberos[0], service: 'nous' });
  o.finirSet(env, 25, 25);
  assert.equal(env.ui.view, 'live', '25–25 ne termine pas le set');
  o.point(env, 'gagne', 'inconnue-inconnu');
  assert.equal(env.ui.view, 'live', '26–25 ne termine pas le set');
  o.point(env, 'gagne', 'inconnue-inconnu');
  assert.equal(env.ui.view, 'rapport');
  assert.deepEqual([o.etat(env).nous, o.etat(env).adv], [27, 25]);

  // Set 4 perdu : 2 sets partout.
  env.act('next-set');
  o.demarrerSet(env, F, { libero: liberos[0], service: 'adv' });
  o.finirSet(env, 20, 25);
  let ms = env.ctx.matchState(m);
  assert.deepEqual({ ...ms.w }, { nous: 2, adv: 2 });
  assert.equal(ms.fini, false);

  // Set 5 : set décisif en 15 points.
  env.act('next-set');
  o.demarrerSet(env, F, { libero: liberos[0], service: 'nous' });
  assert.equal(o.etat(env).cible, 15);
  o.finirSet(env, 14, 14);
  o.point(env, 'gagne', 'inconnue-inconnu');
  assert.equal(env.ui.view, 'live', '15–14 ne termine pas le set décisif');
  o.point(env, 'gagne', 'inconnue-inconnu');
  ms = env.ctx.matchState(m);
  assert.deepEqual({ ...ms.w }, { nous: 3, adv: 2 });
  assert.ok(ms.fini);
  assert.match(env.ui.flash, /Match terminé : sets 3–2/);
  assert.ok(!env.boutons().some((b) => b.a === 'next-set'), 'pas de 6e set');

  // Chaque set : rotation finale = rotation recalculée indépendamment.
  m.sets.forEach((set, k) => assert.deepEqual(ms.states[k].pos, tourner(F, rotationsAttendues(set) % 6), 'rotation du set ' + set.numero));

  // Stats du match complet cohérentes avec le score.
  const S = env.ctx.computeStats(m, 'all');
  const total = ms.states.reduce((a, x) => [a[0] + x.nous, a[1] + x.adv], [0, 0]);
  assert.deepEqual([S.T.won, S.T.lost], total);
  o.verifierMatch(env, m, { complet: true, ctx: 'fin de match' });

  // Le match est terminé : l'étape Saisie renvoie à la préparation d'un match.
  env.act('go', 'live');
  assert.equal(env.ui.view, 'match');
});

test('amical en nombre de sets fixe', () => {
  const env = creerApp();
  o.creerEquipe(env, 8, 0);
  const m = o.nouveauMatch(env, { type: 'amical', regles: { mode: 'fixe', sets: 2, pts: 15 } });
  assert.deepEqual([m.regles.mode, m.regles.nombreSets, m.regles.pointsParSet, m.regles.rempMax], ['fixe', 2, 15, null]);
  const F = o.effectif(m).joueurs.slice(0, 6);
  o.demarrerSet(env, F);
  assert.equal(o.etat(env).cible, 15);
  o.finirSet(env, 15, 10);
  env.act('next-set');
  o.demarrerSet(env, F, { service: 'adv' });
  assert.equal(o.etat(env).cible, 15, 'pas de set décisif en nombre fixe');
  o.finirSet(env, 12, 15);
  const ms = env.ctx.matchState(m);
  assert.ok(ms.fini, 'match fini après 2 sets');
  assert.deepEqual({ ...ms.w }, { nous: 1, adv: 1 });
  o.verifierMatch(env, m, { complet: true });
});

test('l\'exemple se charge et respecte les invariants', {
  todo: 'bug connu : l\'exemple attribue un contre gagnant à un joueur en zone 1',
}, () => {
  const env = creerApp();
  assert.equal(env.ui.view, 'equipe');
  assert.ok(env.db.welcome, 'premier lancement : écran de bienvenue');
  env.act('try-example');
  assert.equal(env.db.exemple, true);
  assert.equal(env.ui.view, 'live');
  const m = o.match(env), st = o.etat(env);
  assert.deepEqual([st.nous, st.adv], [6, 5]);
  o.verifierMatch(env, m, { complet: true, ctx: 'exemple' });
});
