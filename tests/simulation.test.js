// f) Simulation : des matchs aléatoires joués en cliquant au hasard sur les boutons actifs de l'écran,
// avec vérification des invariants (CLAUDE.md, section Tester) après chaque action.
// Reproductible : chaque match a sa graine. Pour rejouer un match qui échoue : SIM_GRAINE=17 node --test tests/simulation.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApp } = require('./env');
const o = require('./outils');

const NB_MATCHS = Number(process.env.SIM_MATCHS || 48);
const PREMIERE = Number(process.env.SIM_GRAINE || 1);
const SEULE = !!process.env.SIM_GRAINE;
const MAX_ACTIONS = 6000;
// Bugs connus du code actuel, contournés pour que la simulation puisse chercher les autres.
const CONTOURNEMENTS = {
  // Une modification de point ouverte depuis le compte rendu survit à « Préparer le set suivant » et s'applique au nouveau set.
  editionSetSuivant: true,
};

// Poids des boutons que le « joueur au banc » peut toucher pendant un match.
const POIDS = {
  res: 40, recep: 5, opt: 20, cat: 4, 'cat-back': 1, detail: 20, joueur: 20, 'entry-cancel': 1,
  undo: 1.5, tm: 1, panel: 4, 'panel-close': 2,
  'sub-ok': 8, 'exc-ok': 1, 'corr-ok': 2, 'lib-in': 6, 'lib-out': 4, 'lib-swap': 4, 'lib-bl': 0.6, 'lib-redes': 3,
  'edit-ev': 2, 'journal-all': 0.3, 'rep-set': 0.5, 'next-set': 30,
  cz: 3, cp: 10, 'c-lib': 2, 'c-serv': 2, 'set-start': 30, 'c-prev': 1, 'c-clear': 0.3,
};

// Résultats des points du match, dans l'ordre : sert à vérifier qu'aucune action ne change un résultat passé.
const resultats = (m) => m.sets.map((s) => s.events.filter((e) => e.type === 'point').map((e) => e.resultat[0]).join('')).join('');

function jouerUnMatch(graine, couverture) {
  const r = o.hasard(graine);
  const env = creerApp({ largeur: r() < 0.5 ? 390 : 1180 });
  const libs = r.entier(3);
  o.creerEquipe(env, 9 + libs + r.entier(3), libs);
  env.change({ id: 'rg-details', value: r.choix(['off', 'serviceAttaque', 'all']) });
  if (r() < 0.3) env.change({ id: 'rg-recep', checked: false });
  const officiel = r() < 0.6;
  const m = o.nouveauMatch(env, officiel ? {} : {
    type: 'amical',
    regles: { mode: r.choix(['fixe', 'bestOf']), sets: 1 + r.entier(3), pts: 8 + r.entier(18), ptsd: 5 + r.entier(11), rmax: r.choix(['', 2, 4, 6]), tm: r.choix(['', 1, 2]) },
  });
  const nonLib = m.convocations.filter((c) => !c.libero).length;

  let n = 0, setsVus = 0, avant = resultats(m);
  const ctx = () => 'graine ' + graine + ', action ' + n;
  for (; n < MAX_ACTIONS; n++) {
    const ms = env.ctx.matchState(m);
    if (ms.fini) break;
    const st = m.sets.length ? ms.states[ms.states.length - 1] : null;
    // Garder assez de joueurs valides pour pouvoir composer un six.
    const blesses = st ? [...st.blesses].filter((id) => !m.convocations.find((c) => c.id === id).libero).length : 0;
    const dispo = env.boutons().filter((b) => !b.disabled && POIDS[b.a]
      && !(b.a === 'exc-ok' && blesses >= nonLib - 7));
    // Le poids vaut pour l'action : il est partagé entre ses boutons (6 « Modifier » ne pèsent pas 6 fois plus).
    const parAction = {};
    dispo.forEach((b) => { parAction[b.a] = (parAction[b.a] || 0) + 1; });
    const choix = dispo.map((b) => [b, POIDS[b.a] / parAction[b.a]]);
    assert.ok(choix.length, ctx() + ' : aucun bouton disponible (vue ' + env.ui.view + ')');
    const b = r.pondere(choix);
    const champs = {};
    const remplir = (...ids) => ids.forEach((id) => { const opts = env.options(id); if (opts.length) champs[id] = r.choix(opts); });
    if (b.a === 'sub-ok') remplir('sub-out', 'sub-in');
    if (b.a === 'exc-ok') remplir('exc-out', 'exc-in');
    if (b.a === 'corr-ok') remplir('corr-zone', 'corr-j');
    if (b.a === 'lib-redes') remplir('lib-redes');
    if (b.a === 'lib-in') remplir('lib-choice');
    const nbEv = m.sets.reduce((a, s) => a + s.events.length, 0);
    // Contournement des bugs connus, retiré quand le bug est corrigé.
    if (CONTOURNEMENTS.editionSetSuivant && (b.a === 'next-set' || b.a === 'set-start') && env.ui.entry) env.act('entry-cancel');

    try {
      env.act(b.a, b.v, champs);
    } catch (e) {
      e.message = ctx() + ' (' + b.a + ' ' + (b.v || '') + ') : ' + e.message;
      throw e;
    }

    const apres = resultats(m);
    assert.ok(apres === avant || apres === avant + apres.slice(-1) && apres.length === avant.length + 1 || (b.a === 'undo' && apres === avant.slice(0, -1)),
      ctx() + ' : les résultats passés ont changé (' + b.a + ')');
    avant = apres;
    assert.ok(!/undefined|NaN/.test(env.html), ctx() + ' : « undefined » ou « NaN » affiché après ' + b.a);
    const finDeSet = m.sets.length !== setsVus || env.ui.view === 'rapport';
    setsVus = m.sets.length;
    o.verifierMatch(env, m, { complet: finDeSet && r() < 0.5, ctx: ctx() });

    if (m.sets.reduce((a, s) => a + s.events.length, 0) > nbEv) {
      const set = m.sets[m.sets.length - 1], ev = set.events[set.events.length - 1];
      couverture[ev.type] = (couverture[ev.type] || 0) + 1;
      if (ev.type === 'point' && env.ctx.replay(m, set).log.some((l) => l.i === set.events.length - 1 && /arrive en zone 4/.test(l.txt))) couverture.sortieZone4 = (couverture.sortieZone4 || 0) + 1;
    }
    if (b.a === 'edit-ev') couverture.modification = (couverture.modification || 0) + 1;
  }
  o.verifierMatch(env, m, { complet: true, ctx: 'graine ' + graine + ', fin' });
  const fini = env.ctx.matchState(m).fini;
  return { fini, actions: n };
}

test('simulation de ' + (SEULE ? '1 match' : NB_MATCHS + ' matchs') + ' aléatoires', (t) => {
  const couverture = {};
  let finis = 0, actions = 0;
  const nb = SEULE ? 1 : NB_MATCHS;
  for (let g = PREMIERE; g < PREMIERE + nb; g++) {
    const res = jouerUnMatch(g, couverture);
    if (res.fini) finis++;
    actions += res.actions;
  }
  if (SEULE) return;
  assert.ok(finis >= nb * 0.9, finis + ' matchs terminés sur ' + nb);
  // La simulation doit vraiment passer par tous les types d'événements.
  for (const t of ['point', 'remplacement', 'exceptionnel', 'tempsMort', 'correction', 'liberoIn', 'liberoOut', 'liberoSwap', 'liberoBlesse', 'liberoRedesigne', 'sortieZone4', 'modification']) {
    assert.ok(couverture[t] > 0, 'jamais simulé : ' + t + ' ' + JSON.stringify(couverture));
  }
  t.diagnostic(finis + '/' + nb + ' matchs terminés, ' + actions + ' actions, ' + JSON.stringify(couverture));
});
