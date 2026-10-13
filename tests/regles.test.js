// b) Éligibilité selon la zone : contre réservé aux avants, libéro qui n'attaque pas, faute des 3 m, causes bloquées selon le service.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApp } = require('./env');
const o = require('./outils');

// Match avec libéro en jeu en zone 5 (index 4), service adverse.
function preparer() {
  const env = creerApp();
  o.creerEquipe(env, 10, 1);
  const m = o.nouveauMatch(env);
  const { joueurs, liberos } = o.effectif(m);
  const F = joueurs.slice(0, 6);
  o.demarrerSet(env, F, { libero: liberos[0], service: 'adv' });
  env.act('lib-in', F[4]);
  const st = o.etat(env);
  assert.equal(st.pos[4], liberos[0]);
  assert.ok(st.libero.on);
  const opt = (res, id) => env.evaluer('ALL_OPTS')[res + '|' + id];
  const raison = (res, id, i, detail = null) => env.ctx.ineligible(opt(res, id), detail, st, i);
  return { env, m, F, L: liberos[0], st, opt, raison };
}
const AVANT = [1, 2, 3], ARRIERE_HORS_LIB = [0, 5], LIB = 4;

test('le contre est réservé à la rangée avant', () => {
  const { raison } = preparer();
  for (const [res, id] of [['gagne', 'contreGagnant-nous'], ['perdu', 'blocOut-adversaire']]) {
    AVANT.forEach((i) => assert.equal(raison(res, id, i), null, id + ' zone ' + (i + 1)));
    [...ARRIERE_HORS_LIB, LIB].forEach((i) => assert.equal(raison(res, id, i), 'arrière : ne contre pas', id + ' zone ' + (i + 1)));
  }
});

test('le libéro n\'attaque pas, les arrières peuvent attaquer', () => {
  const { raison } = preparer();
  for (const [res, id] of [['gagne', 'attaqueGagnante-nous'], ['gagne', 'blocOut-nous'], ['perdu', 'attaqueFaute-nous'], ['perdu', 'contreGagnant-adversaire']]) {
    [...AVANT, ...ARRIERE_HORS_LIB].forEach((i) => assert.equal(raison(res, id, i), null, id + ' zone ' + (i + 1)));
    assert.equal(raison(res, id, LIB), 'le libéro n\'attaque pas', id + ' libéro');
  }
});

test('deuxième main gagnante : joueur avant uniquement, jamais le libéro', () => {
  const { raison } = preparer();
  AVANT.forEach((i) => assert.equal(raison('gagne', 'deuxiemeMainGagnante-nous', i), null));
  ARRIERE_HORS_LIB.forEach((i) => assert.equal(raison('gagne', 'deuxiemeMainGagnante-nous', i), 'arrière : interdit devant les 3 m'));
  assert.equal(raison('gagne', 'deuxiemeMainGagnante-nous', LIB), 'libéro');
});

test('faute des 3 m et contre d\'un arrière : arrières hors libéro', () => {
  const { raison } = preparer();
  for (const d of ['faute3m', 'contreArriere']) {
    AVANT.forEach((i) => assert.equal(raison('perdu', 'fauteTechnique-nous', i, d), 'joueur avant', d));
    ARRIERE_HORS_LIB.forEach((i) => assert.equal(raison('perdu', 'fauteTechnique-nous', i, d), null, d));
    assert.equal(raison('perdu', 'fauteTechnique-nous', LIB, d), 'libéro : faute du libéro', d);
  }
  [...AVANT, ...ARRIERE_HORS_LIB].forEach((i) => assert.equal(raison('perdu', 'fauteTechnique-nous', i, 'fauteLibero'), 'ce n\'est pas le libéro'));
  assert.equal(raison('perdu', 'fauteTechnique-nous', LIB, 'fauteLibero'), null);
  [0, 1, 2, 3, 4, 5].forEach((i) => assert.equal(raison('perdu', 'fauteTechnique-nous', i, 'position'), 'faute collective'));
});

test('« faute du libéro » indisponible sans libéro en jeu', () => {
  const env = creerApp();
  o.creerEquipe(env, 10, 1);
  const m = o.nouveauMatch(env);
  o.demarrerSet(env, o.effectif(m).joueurs.slice(0, 6), { libero: o.effectif(m).liberos[0] });
  assert.equal(env.ctx.detailBlocked('fauteLibero', o.etat(env)), 'libéro pas en jeu');
  assert.equal(env.ctx.detailBlocked('faute3m', o.etat(env)), null);
});

test('causes bloquées selon qui sert', () => {
  const { env, opt } = preparer();                        // service adverse
  let st = o.etat(env);
  assert.equal(env.ctx.optBlocked(opt('gagne', 'ace-nous'), st), 'on ne sert pas');
  assert.equal(env.ctx.optBlocked(opt('perdu', 'fauteService-nous'), st), 'on ne sert pas');
  assert.equal(env.ctx.optBlocked(opt('gagne', 'fauteService-adversaire'), st), null);
  assert.equal(env.ctx.optBlocked(opt('perdu', 'receptionRatee-nous'), st), null);
  o.point(env, 'gagne', 'fauteService-adversaire');      // on récupère le service
  st = o.etat(env);
  assert.equal(env.ctx.optBlocked(opt('gagne', 'ace-nous'), st), null);
  assert.equal(env.ctx.optBlocked(opt('gagne', 'fauteService-adversaire'), st), 'l\'adversaire ne sert pas');
  assert.equal(env.ctx.optBlocked(opt('perdu', 'receptionRatee-nous'), st), 'on est au service');
});

test('à l\'écran, les joueurs inéligibles sont grisés', () => {
  const { env, F, L } = preparer();
  env.act('res', 'gagne');
  env.act('opt', 'contreGagnant-nous');
  assert.equal(env.ui.entry.step, 'joueur');
  const b = Object.fromEntries(env.boutons().filter((x) => x.a === 'joueur').map((x) => [x.v, x.disabled]));
  const st = o.etat(env);
  AVANT.forEach((i) => assert.equal(b[st.pos[i]], false, 'avant cliquable'));
  [0, 4, 5].forEach((i) => assert.equal(b[st.pos[i]], true, 'arrière grisé'));
  env.act('entry-cancel');
  env.act('res', 'gagne');
  env.act('opt', 'attaqueGagnante-nous');
  const b2 = Object.fromEntries(env.boutons().filter((x) => x.a === 'joueur').map((x) => [x.v, x.disabled]));
  assert.equal(b2[L], true, 'libéro grisé pour une attaque');
  assert.equal(b2[F[0]], false, 'arrière autorisé à attaquer');
});

test('faute de position : collective, enregistrée sans joueur', () => {
  const { env, m } = preparer();
  env.act('panel', 'reglages');
  env.change({ id: 'rg-details', value: 'all' });
  env.act('panel-close');
  o.point(env, 'perdu', 'fauteTechnique-nous', { detail: 'position' });
  const ev = m.sets[0].events.at(-1);
  assert.equal(ev.detail, 'position');
  assert.equal(ev.joueurID, null);
});

test('ace adverse = réception ratée, note 0, « Collectif » possible', () => {
  const { env, m } = preparer();
  o.point(env, 'perdu', 'receptionRatee-nous');           // Collectif
  let ev = m.sets[0].events.at(-1);
  assert.deepEqual([ev.joueurID, ev.noteReception], [null, 0]);
  o.point(env, 'perdu', 'receptionRatee-nous', { joueur: o.etat(env).pos[5], recep: 2 });
  ev = m.sets[0].events.at(-1);
  assert.equal(ev.noteReception, 0, 'la note saisie est remplacée par 0');
  assert.ok(ev.joueurID);
});
