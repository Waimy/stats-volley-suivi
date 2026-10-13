// c) Remplacements officiels (6 maximum, paires titulaire/remplaçant), remplacement exceptionnel, libéro.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApp } = require('./env');
const o = require('./outils');

// 12 joueurs dont 2 libéros : 6 titulaires F, 4 remplaçants B, libéros L.
function preparer({ type = 'officiel', service = 'nous', regles } = {}) {
  const env = creerApp();
  o.creerEquipe(env, 12, 2);
  const m = o.nouveauMatch(env, { type, regles });
  const { joueurs, liberos } = o.effectif(m);
  const F = joueurs.slice(0, 6), B = joueurs.slice(6);
  o.demarrerSet(env, F, { libero: liberos[0], service });
  const sub = (out, inn) => { env.act('sub-ok', null, { 'sub-out': out, 'sub-in': inn }); return env.ui.err; };
  const exc = (out, inn) => { env.act('exc-ok', null, { 'exc-out': out, 'exc-in': inn }); return env.ui.err; };
  return { env, m, F, B, L: liberos, sub, exc, nbEv: () => o.set(env).events.length };
}

test('paires titulaire / remplaçant en officiel', () => {
  const { env, m, F, B, sub } = preparer();
  assert.equal(sub(F[0], B[0]), '');
  assert.equal(o.etat(env).pos[0], B[0]);
  assert.match(sub(B[0], B[1]), /ne peut sortir qu'au profit de .* \(son titulaire\)/);
  assert.match(sub(F[1], B[0]), /Ce joueur a déjà joué ce set/);
  assert.equal(sub(B[0], F[0]), '', 'le titulaire revient à la place de son remplaçant');
  assert.match(sub(F[0], B[0]), /déjà sorti et revenu/);
  assert.equal(o.etat(env).subs, 2);
  o.verifierMatch(env, m, { complet: true });
});

test('6 remplacements maximum par set, compteur remis à zéro au set suivant', () => {
  const { env, m, F, B, sub } = preparer();
  [[F[0], B[0]], [B[0], F[0]], [F[1], B[1]], [F[2], B[2]], [F[3], B[3]], [B[1], F[1]]].forEach(([a, b], k) => assert.equal(sub(a, b), '', 'remplacement ' + (k + 1)));
  assert.equal(o.etat(env).subs, 6);
  assert.match(sub(B[2], F[2]), /Plus de remplacement possible \(6 max par set\)/);
  assert.equal(o.etat(env).subs, 6);
  assert.match(env.html, /Remplacements <b>6\/6<\/b>/);
  o.finirSet(env, 25, 0);
  env.act('next-set');
  o.demarrerSet(env, F, { service: 'adv' });
  assert.equal(o.etat(env).subs, 0);
  assert.equal(sub(F[0], B[0]), '');
  o.verifierMatch(env, m, { complet: true });
});

test('amical : remplacements libres si aucune limite', () => {
  const { env, F, B, sub } = preparer({ type: 'amical' });
  for (let k = 0; k < 10; k++) assert.equal(sub(k % 2 ? B[0] : F[0], k % 2 ? F[0] : B[0]), '', 'remplacement ' + (k + 1));
  assert.equal(o.etat(env).subs, 10);
  assert.equal(sub(F[1], B[0]), '', 'pas de règle de paires en amical');
});

test('remplacement exceptionnel : seulement si aucun remplacement régulier, non compté, blessé exclu du match', () => {
  const { env, m, F, B, sub, exc } = preparer();
  assert.match(exc(F[4], B[0]), /Un remplacement régulier est encore possible/);
  [[F[0], B[0]], [B[0], F[0]], [F[1], B[1]], [F[2], B[2]], [F[3], B[3]], [B[1], F[1]]].forEach(([a, b]) => assert.equal(sub(a, b), ''));
  assert.equal(exc(F[4], B[0]), '', 'plus de remplacement régulier : exceptionnel accepté');
  let st = o.etat(env);
  assert.equal(st.subs, 6, 'non compté');
  assert.ok(st.blesses.has(F[4]));
  assert.ok(!env.ctx.benchFor(m, st).some((c) => c.id === F[4]), 'le blessé n\'est plus sur le banc');
  assert.match(sub(B[0], F[4]), /Plus de remplacement possible|Joueur blessé/);
  o.finirSet(env, 25, 0);
  env.act('next-set');
  assert.ok(!env.ui.compo.slots.includes(F[4]), 'le blessé est retiré du six repris');
  assert.ok(!env.boutons().some((b) => b.a === 'cp' && b.v === F[4]), 'le blessé n\'est plus proposé');
  o.verifierMatch(env, m, { complet: true });
});

test('remplacement exceptionnel en amical : toujours possible', () => {
  const { env, F, B, exc } = preparer({ type: 'amical' });
  assert.equal(exc(F[4], B[0]), '');
  assert.equal(o.etat(env).subs, 0);
});

test('libéro : entrée pour un arrière, jamais en zone 1 quand on sert', () => {
  const { env, m, F, L, nbEv } = preparer({ service: 'nous' });
  env.act('panel', 'libero');
  const b = Object.fromEntries(env.boutons().filter((x) => x.a === 'lib-in').map((x) => [x.v, x.disabled]));
  assert.deepEqual(Object.keys(b).sort(), [F[0], F[4], F[5]].sort(), 'seuls les arrières sont proposés');
  assert.equal(b[F[0]], true, 'zone 1 grisée quand on sert');
  assert.equal(b[F[4]], false);
  env.act('lib-in', F[5]);
  const st = o.etat(env);
  assert.equal(st.pos[5], L[0]);
  assert.equal(st.libero.replaced, F[5]);
  assert.ok(!env.ctx.benchFor(m, st).some((c) => c.id === F[5]), 'le joueur remplacé par le libéro ne peut pas entrer en remplacement');
  o.verifierMatch(env, m, { complet: true });
  assert.equal(nbEv(), 1);
});

test('libéro : un échange joué entre deux changements', () => {
  const { env, m, F, L, nbEv } = preparer({ service: 'adv' });
  env.act('lib-in', F[4]);
  assert.equal(nbEv(), 1);
  env.act('lib-out');
  env.act('lib-swap', L[1]);
  assert.equal(nbEv(), 1, 'sortie et échange refusés avant un échange de jeu');
  env.act('panel', 'libero');
  assert.match(env.html, /Un échange doit être joué entre deux changements de libéro/);
  o.point(env, 'perdu', 'inconnue-inconnu');
  env.act('lib-out');
  assert.equal(nbEv(), 3);
  let st = o.etat(env);
  assert.ok(!st.libero.on);
  assert.equal(st.pos[4], F[4], 'le joueur remplacé revient à sa place');
  env.act('lib-in', F[5]);
  assert.equal(nbEv(), 3, 'nouvelle entrée refusée juste après une sortie');
  o.verifierMatch(env, m, { complet: true });
});

test('libéro : sortie automatique en arrivant en zone 4', () => {
  const { env, m, F, L } = preparer({ service: 'adv' });
  env.act('lib-in', F[4]);                       // zone 5
  o.point(env, 'gagne', 'inconnue-inconnu');     // side-out : rotation, zone 5 → zone 4
  const st = o.etat(env);
  assert.equal(st.pos[3], F[4], 'le joueur remplacé revient en zone 4');
  assert.ok(!st.pos.includes(L[0]));
  assert.ok(!st.libero.on);
  assert.ok(st.libLock, 'la sortie automatique compte comme un changement');
  assert.ok(st.log.some((l) => /arrive en zone 4 et sort/.test(l.txt)));
  const avant = o.set(env).events.length;
  env.act('lib-in', st.pos[4]);
  assert.equal(o.set(env).events.length, avant, 'pas de nouvelle entrée avant un échange');
  o.verifierMatch(env, m, { complet: true });
});

test('échange entre libéros', () => {
  const { env, m, F, L } = preparer({ service: 'adv' });
  env.act('lib-in', F[4]);
  o.point(env, 'perdu', 'inconnue-inconnu');
  env.act('lib-swap', L[1]);
  const st = o.etat(env);
  assert.equal(st.pos[4], L[1]);
  assert.equal(st.libero.id, L[1]);
  assert.equal(st.libero.replaced, F[4], 'le joueur remplacé reste le même');
  o.verifierMatch(env, m, { complet: true });
});

test('libéro blessé : remplacé par l\'autre libéro, puis par le joueur remplacé ; exclu du match', () => {
  const { env, m, F, L } = preparer({ service: 'adv' });
  env.act('lib-in', F[4]);
  env.act('lib-bl', L[0] + '|' + L[1]);         // pas de verrou pour une blessure
  let st = o.etat(env);
  assert.equal(st.pos[4], L[1]);
  assert.ok(st.blesses.has(L[0]));
  assert.deepEqual([...env.ctx.liberosDispo(m, st)], [L[1]]);
  env.act('lib-bl', L[1] + '|');
  st = o.etat(env);
  assert.equal(st.pos[4], F[4], 'sans autre libéro, le joueur remplacé revient');
  assert.ok(!st.libero.on);
  assert.equal(env.ctx.liberosDispo(m, st).length, 0);
  o.verifierMatch(env, m, { complet: true });
  o.finirSet(env, 25, 0);
  env.act('next-set');
  assert.ok(!env.boutons().some((b) => b.a === 'c-lib' && (b.v === L[0] || b.v === L[1])), 'libéros blessés absents du set suivant');
});

test('re-désignation d\'un libéro quand plus aucun n\'est disponible', () => {
  const { env, m, F, B, L } = preparer({ service: 'adv' });
  env.act('lib-bl', L[0] + '|');
  env.act('lib-bl', L[1] + '|');
  env.act('panel', 'libero');
  assert.match(env.html, /Plus aucun libéro disponible/);
  const proposes = env.options('lib-redes');
  assert.ok(proposes.includes(B[0]) && !proposes.some((id) => F.includes(id)), 'seuls les joueurs hors du terrain sont proposés');
  env.act('lib-redes', null, {});
  assert.match(env.ui.err, /Choisis le joueur/);
  env.act('lib-redes', null, { 'lib-redes': B[0] });
  let st = o.etat(env);
  assert.ok(env.ctx.isLib(m, st, B[0]));
  assert.equal(st.libero.id, B[0]);
  assert.ok(!env.ctx.benchFor(m, st).some((c) => c.id === B[0]), 'le nouveau libéro ne peut plus entrer comme joueur');
  o.point(env, 'perdu', 'inconnue-inconnu');
  env.act('lib-in', F[5]);
  st = o.etat(env);
  assert.equal(st.pos[5], B[0]);
  o.verifierMatch(env, m, { complet: true });
  o.finirSet(env, 25, 0);
  env.act('next-set');
  const c = env.boutons();
  assert.ok(c.some((b) => b.a === 'c-lib' && b.v === B[0]), 're-désigné proposé comme libéro au set suivant');
  assert.ok(!c.some((b) => b.a === 'cp' && b.v === B[0]), 're-désigné plus proposé comme joueur');
});
