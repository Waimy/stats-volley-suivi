// d) Annuler et modifier un point. e) Correction de position (transfert du rôle de titulaire).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApp } = require('./env');
const o = require('./outils');

function preparer(service = 'nous') {
  const env = creerApp();
  o.creerEquipe(env, 12, 1);
  const m = o.nouveauMatch(env);
  const { joueurs, liberos } = o.effectif(m);
  const F = joueurs.slice(0, 6), B = joueurs.slice(6);
  o.demarrerSet(env, F, { libero: liberos[0], service });
  const sub = (out, inn) => { env.act('sub-ok', null, { 'sub-out': out, 'sub-in': inn }); return env.ui.err; };
  const corr = (zone, joueur) => { env.act('corr-ok', null, { 'corr-zone': zone, 'corr-j': joueur }); return env.ui.err; };
  return { env, m, F, B, L: liberos[0], sub, corr };
}

test('annuler retire le dernier événement et recalcule tout', () => {
  const { env, m, F } = preparer();
  o.point(env, 'perdu', 'inconnue-inconnu');
  o.point(env, 'gagne', 'inconnue-inconnu');           // side-out : rotation
  assert.deepEqual([...o.etat(env).pos], [F[1], F[2], F[3], F[4], F[5], F[0]]);
  env.act('undo');
  const st = o.etat(env);
  assert.deepEqual([st.nous, st.adv, st.service], [0, 1, 'adv']);
  assert.deepEqual(st.pos, F, 'rotation annulée');
  assert.equal(m.sets[0].events.length, 1);
  assert.equal(env.ui.flash, 'Dernier événement annulé.');
  env.act('tm', 'nous');
  assert.equal(o.etat(env).tm.nous, 1);
  env.act('undo');
  assert.equal(o.etat(env).tm.nous, 0, 'un temps mort s\'annule aussi');
});

test('annuler le point qui termine un set rouvre le set', () => {
  const { env, m } = preparer();
  o.finirSet(env, 25, 3);
  assert.equal(env.ui.view, 'rapport');
  env.act('undo');
  assert.equal(env.ui.view, 'live');
  assert.deepEqual([o.etat(env).nous, o.etat(env).adv], [24, 3]);
  o.point(env, 'gagne', 'inconnue-inconnu');
  env.act('next-set');
  o.demarrerSet(env, env.ui.compo.slots, { service: 'adv' });
  assert.equal(m.sets.length, 2);
  env.act('undo');                                      // set 2 vide : on revient au set 1 terminé
  assert.equal(m.sets.length, 1);
  assert.equal(env.ui.view, 'rapport');
  assert.equal(String(env.ui.reportSet), '1');
});

test('modifier un point garde le résultat et le score, remplace la cause', () => {
  const { env, m, F } = preparer('nous');
  o.point(env, 'perdu', 'attaqueGagnante-adversaire');  // 0–1, F[0] servait
  o.point(env, 'gagne', 'inconnue-inconnu');            // 1–1, rotation
  o.point(env, 'gagne', 'inconnue-inconnu');            // 2–1, F[1] sert
  const t0 = m.sets[0].events[0].t;
  env.act('edit-ev', 0);
  assert.match(env.html, /Modification du point n°1 du set 1 \(score avant : 0–0\)/);
  assert.equal(env.ui.entry.resultat, 'perdu', 'résultat imposé');
  env.act('opt', 'fauteService-nous');
  const ev = m.sets[0].events[0];
  assert.equal(ev.cause, 'fauteService');
  assert.equal(ev.resultat, 'perdu');
  assert.equal(ev.joueurID, F[0], 'serveur de l\'époque, pas le serveur actuel');
  assert.equal(ev.t, t0, 'horodatage conservé');
  const st = o.etat(env);
  assert.deepEqual([st.nous, st.adv], [2, 1]);
  assert.equal(m.sets[0].events.length, 3);
  assert.match(env.ui.flash, /Point modifié/);

  // Modifier un point gagné en attaque gagnante : le joueur est choisi dans la rotation de l'époque.
  env.act('edit-ev', 1);
  env.act('opt', 'attaqueGagnante-nous');
  const proposes = env.boutons().filter((b) => b.a === 'joueur').map((b) => b.v).sort();
  assert.deepEqual(proposes, [...F].sort());
  env.act('joueur', F[3]);
  assert.equal(m.sets[0].events[1].joueurID, F[3]);
  o.verifierMatch(env, m, { complet: true });
});

test('modifier un point : les causes impossibles à l\'époque sont grisées', () => {
  const { env } = preparer('adv');
  o.point(env, 'gagne', 'inconnue-inconnu');            // on récupère le service
  o.point(env, 'gagne', 'inconnue-inconnu');
  env.act('edit-ev', 0);                                  // à l'époque, l'adversaire servait
  env.act('cat', 'service');
  const ace = env.boutons().find((b) => b.a === 'opt' && b.v === 'ace-nous');
  assert.ok(ace && ace.disabled, 'ace impossible sur service adverse');
  env.act('entry-cancel');
  env.act('edit-ev', 1);
  env.act('cat', 'service');
  const ace2 = env.boutons().find((b) => b.a === 'opt' && b.v === 'ace-nous');
  assert.ok(ace2 && !ace2.disabled);
});

test('correction : échange de deux joueurs du terrain, non compté', () => {
  const { env, m, F, corr } = preparer();
  assert.equal(corr(0, F[3]), '');
  const st = o.etat(env);
  assert.deepEqual([st.pos[0], st.pos[3]], [F[3], F[0]]);
  assert.equal(st.subs, 0);
  assert.match(corr(0, F[3]), /déjà dans cette zone/);
  o.verifierMatch(env, m, { complet: true });
});

test('correction avec un joueur du banc : il prend le rôle de titulaire', () => {
  const { env, m, F, B, sub, corr } = preparer();
  assert.equal(corr(2, B[0]), '');                       // B0 était en fait titulaire à la place de F2
  let st = o.etat(env);
  assert.equal(st.pos[2], B[0]);
  assert.equal(st.subs, 0, 'non compté');
  assert.ok(st.starters.has(B[0]) && !st.starters.has(F[2]));
  assert.ok(!st.played.has(F[2]), 'le joueur mal saisi n\'a pas joué');
  assert.equal(sub(B[0], B[1]), '', 'le nouveau titulaire sort pour un remplaçant');
  assert.match(sub(B[1], F[2]), /ne peut sortir qu'au profit de/, 'le remplaçant ne rend sa place qu\'au nouveau titulaire');
  assert.equal(sub(F[1], F[2]), '', 'le joueur mal saisi peut entrer comme remplaçant');
  assert.equal(sub(B[1], B[0]), '');
  st = o.etat(env);
  assert.equal(st.subs, 3);
  o.verifierMatch(env, m, { complet: true });
});

test('correction d\'un remplaçant : le nouveau joueur reprend la paire', () => {
  const { env, m, F, B, sub, corr } = preparer();
  assert.equal(sub(F[1], B[0]), '');
  assert.equal(corr(1, B[1]), '');                       // c'est B1, pas B0, qui est entré
  const st = o.etat(env);
  assert.equal(st.pairs[F[1]].sub, B[1]);
  assert.match(sub(B[1], B[2]), /ne peut sortir qu'au profit de/);
  assert.equal(sub(B[1], F[1]), '');
  o.verifierMatch(env, m, { complet: true });
});

test('correction : libéro, joueur remplacé par le libéro et blessés ne sont pas proposés', () => {
  const { env, F, L } = preparer('adv');
  env.act('lib-in', F[4]);
  env.act('panel', 'corr');
  const zones = env.options('corr-zone').map(Number);
  assert.ok(!zones.includes(4), 'la zone du libéro n\'est pas corrigeable');
  const cands = env.options('corr-j');
  assert.ok(!cands.includes(L) && !cands.includes(F[4]));
});

test('une modification ouverte depuis le compte rendu ne passe pas au set suivant', () => {
  const { env, m } = preparer();
  o.finirSet(env, 25, 10);
  assert.equal(env.ui.view, 'rapport');
  env.act('edit-ev', 3);                                 // « Modifier » dans le journal du compte rendu
  assert.equal(env.ui.entry.edit, 3);
  env.act('next-set');                                   // puis « Préparer le set 2 »
  assert.equal(env.ui.entry, null, 'la modification est abandonnée en changeant de set');
  o.demarrerSet(env, env.ui.compo.slots, { service: 'adv' });
  assert.ok(!env.boutons().some((b) => b.a === 'opt'), 'pas de modification fantôme à l\'écran de saisie');
  o.point(env, 'gagne', 'inconnue-inconnu');
  assert.equal(m.sets[1].events.length, 1);
  assert.equal(m.sets[0].events[3].cause, 'inconnue', 'le point du set 1 n\'a pas changé');
});
