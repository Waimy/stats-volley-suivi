// Harnais de test : charge l'app dans Node, sans navigateur ni dépendance.
// Les scripts sont lus dans l'ordre où index.html les déclare (inline ou src locaux), puis exécutés
// dans un même contexte vm avec un faux document, un faux localStorage et de faux File / FileReader.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');

// Liste ordonnée des scripts de index.html : {nom, code}.
function scriptsDeLaPage() {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const src = /\bsrc="([^"]+)"/.exec(m[1]);
    if (src) {
      if (/^https?:/.test(src[1])) continue;
      const fichier = src[1].split('?')[0];
      out.push({ nom: fichier, code: fs.readFileSync(path.join(RACINE, fichier), 'utf8') });
    } else {
      out.push({ nom: 'index.html (inline ' + out.length + ')', code: m[2] });
    }
  }
  return out;
}

function element(id) {
  return {
    id, value: '', checked: false, innerHTML: '', textContent: '', dataset: {}, children: [],
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, remove() {}, click() {}, addEventListener() {}, removeEventListener() {},
  };
}

// Crée une instance de l'app. `stockage` : contenu initial de localStorage (objet clé → chaîne).
function creerApp({ stockage = {}, largeur = 390 } = {}) {
  const store = Object.assign({}, stockage);
  const champs = new Map();
  const ecouteurs = {};
  const exports = [];
  const app = element('app');
  const body = element('body');

  const document = {
    body, hidden: false,
    getElementById(id) {
      if (id === 'app') return app;
      if (!champs.has(id)) champs.set(id, element(id));
      return champs.get(id);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return element(tag); },
    addEventListener(type, fn) { (ecouteurs[type] = ecouteurs[type] || []).push(fn); },
  };

  class FauxFichier {
    constructor(parts, name, opts) { this.contenu = parts.join(''); this.name = name; this.type = opts && opts.type; }
  }
  class FauxFileReader {
    readAsText(f) { this.result = f.contenu; this.onload && this.onload(); }
  }

  const sandbox = {
    document,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    navigator: {},
    innerWidth: largeur, innerHeight: 800,
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, scrollTo() {}, scrollBy() {},
    setTimeout: () => 0, clearTimeout() {},
    File: FauxFichier, Blob: FauxFichier, FileReader: FauxFileReader,
    URL: { createObjectURL(f) { exports.push(f); return 'blob:test'; }, revokeObjectURL() {} },
    console,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const s of scriptsDeLaPage()) vm.runInContext(s.code, ctx, { filename: s.nom });

  const evaluer = (code) => vm.runInContext(code, ctx);
  const env = {
    ctx, store, exports, champs,
    evaluer,
    get db() { return evaluer('db'); },
    get ui() { return evaluer('ui'); },
    get html() { return app.innerHTML; },
    // Déclenche une action comme un clic sur [data-a]. `valeurs` remplit les champs de formulaire lus par l'action.
    act(a, v, valeurs = {}) {
      champs.clear();
      for (const [id, val] of Object.entries(valeurs)) {
        const el = document.getElementById(id);
        if (typeof val === 'boolean') el.checked = val; else el.value = String(val);
      }
      evaluer('act')(a, v == null ? undefined : String(v));
    },
    // Déclenche un événement « change » comme le ferait un champ de formulaire.
    change(cible) { (ecouteurs.change || []).forEach((fn) => fn({ target: cible })); },
    // Boutons [data-a] actuellement affichés : {a, v, disabled}.
    boutons() {
      const out = [];
      const re = /<button\b([^>]*)>/g;
      let m;
      while ((m = re.exec(app.innerHTML))) {
        const at = m[1], a = /data-a="([^"]*)"/.exec(at);
        if (!a) continue;
        const v = /data-v="([^"]*)"/.exec(at);
        out.push({ a: a[1], v: v ? v[1] : undefined, disabled: /\sdisabled(?=[\s>=]|$)/.test(at) });
      }
      return out;
    },
    // Valeurs non vides proposées par un <select id="...">.
    options(id) {
      const m = new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>').exec(app.innerHTML);
      if (!m) return [];
      return [...m[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]).filter(Boolean);
    },
  };
  return env;
}

module.exports = { creerApp, scriptsDeLaPage, RACINE };
