// Outils partagés par les tests : construire une équipe, un match, un set, saisir des points, vérifier les invariants.
'use strict';
const assert = require('node:assert/strict');

// Générateur pseudo-aléatoire reproductible (mulberry32).
function hasard(graine) {
  let a = graine >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.entier = (n) => Math.floor(r() * n);
  r.choix = (liste) => liste[Math.floor(r() * liste.length)];
  // Choix pondéré : liste de [élément, poids].
  r.pondere = (liste) => {
    const total = liste.reduce((s, [, p]) => s + p, 0);
    let x = r() * total;
    for (const [e, p] of liste) { if ((x -= p) < 0) return e; }
    return liste[liste.length - 1][0];
  };
  return r;
}

const POSTES_EQUIPE = ['passeur', 'receptionneurAttaquant', 'central', 'pointu', 'receptionneurAttaquant', 'central', 'libero', 'polyvalent', 'receptionneurAttaquant', 'central', 'libero', 'passeur'];

// Ajoute `n` joueurs par l'écran Équipe. Les `libs` premiers postes « libéro » de la liste sont gardés, les autres deviennent polyvalents.
function creerEquipe(env, n = 10, libs = 1) {
  let l = 0;
  for (let k = 0; k < n; k++) {
    let poste = POSTES_EQUIPE[k % POSTES_EQUIPE.length];
    if (poste === 'libero') { if (l < libs) l++; else poste = 'polyvalent'; }
    env.act('p-save', null, { 'pf-prenom': 'J' + (k + 1), 'pf-nom': 'Nom' + (k + 1), 'pf-num': k + 1, 'pf-poste': poste });
  }
  assert.equal(env.ui.err, '', 'ajout des joueurs : ' + env.ui.err);
  return env.db.players;
}

// Crée un match par l'écran Match (tous les joueurs actifs convoqués). Renvoie le match.
function nouveauMatch(env, { type = 'officiel', regles = {}, adversaire = 'Adversaire' } = {}) {
  if (type !== env.ui.newType) env.change({ name: 'nm-type', value: type });
  const champs = { 'nm-adv': adversaire, 'nm-date': '2026-10-13' };
  for (const p of env.db.players.filter((x) => x.actif)) {
    champs['cv-chk-' + p.id] = true;
    champs['cv-num-' + p.id] = p.numero;
    champs['cv-poste-' + p.id] = p.poste;
    champs['cv-lib-' + p.id] = p.poste === 'libero';
  }
  if (type === 'amical') {
    const R = Object.assign({ mode: 'fixe', sets: 4, pts: 25, ptsd: 15, rmax: '', tm: '' }, regles);
    Object.assign(champs, { 'nm-mode': R.mode, 'nm-sets': R.sets, 'nm-pts': R.pts, 'nm-ptsd': R.ptsd, 'nm-rmax': R.rmax, 'nm-tm': R.tm });
  }
  env.act('m-create', null, champs);
  assert.equal(env.ui.err, '', 'création du match : ' + env.ui.err);
  assert.equal(env.ui.view, 'compo');
  return env.evaluer('curMatch()');
}

// Ids de convocation : non-libéros puis libéros.
function effectif(m) {
  return { joueurs: m.convocations.filter((c) => !c.libero).map((c) => c.id), liberos: m.convocations.filter((c) => c.libero).map((c) => c.id) };
}

// Compose le six (6 ids, index 0 = zone 1) et démarre le set.
function demarrerSet(env, formation, { libero = null, service = 'nous' } = {}) {
  env.act('c-clear');
  formation.forEach((id) => env.act('cp', id));
  env.act('c-lib', libero || '');
  env.act('c-serv', service);
  env.act('set-start');
  assert.equal(env.ui.err, '', 'début du set : ' + env.ui.err);
  assert.equal(env.ui.view, 'live');
}

// Saisit un point comme au banc : [note de réception], Gagné/Perdu, cause, [précision], [joueur].
function point(env, resultat, optId, { joueur = null, detail = null, recep = null } = {}) {
  if (recep != null) env.act('recep', recep);
  env.act('res', resultat);
  env.act('opt', optId);
  let garde = 0;
  while (env.ui.entry && garde++ < 3) {
    if (env.ui.entry.step === 'detail') env.act('detail', detail || '');
    else if (env.ui.entry.step === 'joueur') env.act('joueur', joueur || '');
    else break;
  }
  assert.equal(env.ui.entry, null, 'saisie du point non terminée');
}

const m = (env) => env.evaluer('curMatch()');
const s = (env) => env.evaluer('curSet(curMatch())');
const etat = (env, upTo) => env.ctx.replay(m(env), s(env), upTo);

// Joue le set courant jusqu'au score final (nous, eux) : points alternés, puis l'écart final.
// Points « Je n'ai pas vu » : pas de joueur à désigner, score et rotation restent justes.
function finirSet(env, nous, eux) {
  const st = etat(env), dn = nous - st.nous, de = eux - st.adv, paires = Math.min(dn, de);
  for (let k = 0; k < paires; k++) { point(env, 'gagne', 'inconnue-inconnu'); point(env, 'perdu', 'inconnue-inconnu'); }
  for (let k = paires; k < Math.max(dn, de); k++) point(env, dn > de ? 'gagne' : 'perdu', 'inconnue-inconnu');
}

/* ---------- Invariants ---------- */

// Vérifie l'état d'un set à un instant donné.
function verifierEtat(env, match, set, st, ctx) {
  const R = match.regles, ids = new Set(match.convocations.map((c) => c.id));
  const isLib = (id) => env.ctx.isLib(match, st, id);
  const lieu = ctx + ' (set ' + set.numero + ', ' + st.nous + '–' + st.adv + ')';
  assert.equal(st.pos.length, 6, lieu + ' : 6 places');
  assert.equal(new Set(st.pos).size, 6, lieu + ' : 6 joueurs distincts ' + JSON.stringify(st.pos));
  st.pos.forEach((id) => assert.ok(ids.has(id), lieu + ' : joueur inconnu sur le terrain ' + id));
  [1, 2, 3].forEach((i) => assert.ok(!isLib(st.pos[i]), lieu + ' : libéro en zone avant ' + (i + 1)));
  if (st.service === 'nous') assert.ok(!isLib(st.pos[0]), lieu + ' : libéro au service');
  st.pos.forEach((id) => assert.ok(!st.blesses.has(id), lieu + ' : blessé sur le terrain'));
  if (R.rempMax != null) assert.ok(st.subs <= R.rempMax, lieu + ' : ' + st.subs + ' remplacements > ' + R.rempMax);
  if (st.libero.on) {
    assert.ok(st.pos.includes(st.libero.id), lieu + ' : libéro « en jeu » absent du terrain');
    assert.ok(!st.pos.includes(st.libero.replaced), lieu + ' : joueur remplacé par le libéro encore sur le terrain');
  }
  const libsSurTerrain = st.pos.filter(isLib);
  assert.ok(libsSurTerrain.length <= 1, lieu + ' : deux libéros sur le terrain');
  if (libsSurTerrain.length) assert.ok(st.libero.on && st.libero.id === libsSurTerrain[0], lieu + ' : libéro sur le terrain sans être « en jeu »');
}

// Vérifie qu'un point enregistré était saisissable dans l'état qui le précède.
function verifierPoint(env, match, ev, st, ctx) {
  const o = env.evaluer('ALL_OPTS')[ev.resultat + '|' + ev.cause + '-' + ev.camp];
  assert.ok(o, ctx + ' : cause inconnue ' + ev.cause + '-' + ev.camp);
  assert.ok(!st.ended, ctx + ' : point saisi après la fin du set');
  assert.equal(env.ctx.optBlocked(o, st), null, ctx + ' : cause impossible (' + o.id + ')');
  if (o.attr === 'serveurAuto') assert.equal(ev.joueurID, st.pos[0], ctx + ' : serveur mal attribué');
  if (o.attr === 'aucune') assert.equal(ev.joueurID, null, ctx + ' : joueur attribué à une cause sans joueur');
  if (ev.joueurID) {
    const i = st.pos.indexOf(ev.joueurID);
    assert.ok(i >= 0, ctx + ' : joueur désigné absent du terrain');
    assert.equal(env.ctx.ineligible(o, ev.detail, st, i), null, ctx + ' : joueur inéligible désigné (' + o.id + ', zone ' + (i + 1) + ')');
  }
  if (o.cause === 'receptionRatee') assert.equal(ev.noteReception, 0, ctx + ' : réception ratée sans note 0');
  if (ev.noteReception != null && o.cause !== 'receptionRatee') assert.equal(st.service, 'adv', ctx + ' : note de réception sur notre service');
}

// Invariants du match courant. `complet` : rejoue aussi chaque état intermédiaire (plus lent).
function verifierMatch(env, match, { complet = false, ctx = '' } = {}) {
  if (!match) return;
  const ms = env.ctx.matchState(match), R = match.regles;
  const maxSets = R.mode === 'bestOf' ? 2 * R.setsGagnants - 1 : R.nombreSets;
  if (maxSets) assert.ok(match.sets.length <= maxSets, ctx + ' : trop de sets (' + match.sets.length + ')');
  match.sets.forEach((set, k) => {
    const st = ms.states[k];
    if (k < match.sets.length - 1) assert.ok(st.ended, ctx + ' : set ' + set.numero + ' non terminé suivi d\'un autre set');
    if (st.ended) {
      const gagnant = Math.max(st.nous, st.adv), perdant = Math.min(st.nous, st.adv);
      assert.ok(gagnant === st.cible ? perdant <= st.cible - R.ecart : gagnant - perdant === R.ecart, ctx + ' : score de fin de set incohérent ' + st.nous + '–' + st.adv);
    }
    const nbPoints = set.events.filter((e) => e.type === 'point').length;
    assert.equal(st.nous + st.adv, nbPoints, ctx + ' : score ≠ nombre de points');
    verifierEtat(env, match, set, st, ctx);
    const idx = complet ? set.events.map((_, i) => i) : (set.events.length ? [set.events.length - 1] : []);
    idx.forEach((i) => {
      const avant = env.ctx.replay(match, set, i);
      if (complet) verifierEtat(env, match, set, avant, ctx + ' avant l\'événement ' + i);
      const ev = set.events[i];
      if (ev.type === 'point') verifierPoint(env, match, ev, avant, ctx + ' événement ' + i);
    });
  });
  if (ms.fini) {
    const tous = match.sets.every((x, k) => ms.states[k].ended);
    assert.ok(match.forceFin || tous, ctx + ' : match fini avec un set en cours');
  }
}

module.exports = { hasard, creerEquipe, nouveauMatch, effectif, demarrerSet, point, etat, finirSet, verifierEtat, verifierMatch, match: m, set: s };
