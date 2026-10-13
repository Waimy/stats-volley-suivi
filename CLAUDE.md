# CLAUDE.md : Stats Volley

Contexte pour toute session qui travaille sur ce dépôt. À lire avant de modifier le code.

## Le projet

PWA de statistiques de volley-ball en match, pour une équipe amateur : Harnes Volley-Ball (HVB), championnat loisir Compet'Lib, en **6×6 uniquement**.

- **Utilisateur** : une personne assise au banc, qui saisit chaque point en direct, souvent d'une main, entre deux échanges (10 à 20 s).
- **Appareils** : iPhone en portrait et iPad en paysage d'abord, PC en secondaire.
- **Langue** : toute l'interface est en **français**.
- **En ligne** : https://waimy.github.io/stats-volley-suivi/ (GitHub Pages, branche `main`, racine).
- **Propriétaire** : Rémi (GitHub `Waimy`), joueur au HVB. Il veut des avis francs : signaler clairement une idée ou une solution sous-optimale plutôt que de la valider.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille de la page : balises meta, `styles.css`, puis les trois scripts dans l'ordre. Vanilla JS, aucun framework, aucune étape de build. |
| `styles.css` | Tout le CSS. |
| `js/moteur.js` | Catalogue, utilitaires, version du schéma (`SCHEMA`, `migrer`), moteur (`replay`), règles, `seed()`. **Aucun accès au DOM.** |
| `js/stats.js` | `computeStats`, `lossCat`, `constats`, `bars`. |
| `js/interface.js` | État, thème, fond animé, blocs, vues, sauvegarde, actions, premier rendu. |
| `sw.js` | Service worker : cache de l'app (réseau d'abord pour la page, cache d'abord pour le reste) et cache des polices Google. |
| `tests/` | Tests automatiques (voir « Tester »). |
| `.github/workflows/tests.yml` | Lance `node --test` à chaque push et pull request. |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil. |
| `.nojekyll` | GitHub Pages sert les fichiers tels quels. |
| `ios-natif/Modele.swift` | Modèle SwiftData écrit pour une éventuelle app native. **Référence seulement, plus maintenu, en partie désynchronisé** du JS. |

### Organisation du code (dans l'ordre de chargement)

Les scripts sont des **scripts classiques**, pas des modules ES : leurs déclarations de premier niveau partagent la même portée globale (`db`, `ui`, `replay`…), et le code réassigne `db` et `ui`. Ordre imposé : `moteur.js` → `stats.js` → `interface.js`. Un même nom déclaré dans deux fichiers provoque une erreur de syntaxe au chargement.

1. **CSS** (`styles.css`) : tokens sur `:root` (thème sombre par défaut), surcharges `body[data-mode="light"]` et `body[data-mode="auto"]`. Couleurs du club en `--c1` et `--c2`, injectées par JS.
2. **Catalogue** (`js/moteur.js`, comme 3, 4 et 5) : `POSTES`, `CAT_LABEL`, `CAUSE_CAT`, `DET` (précisions), `OPTIONS.gagne` / `OPTIONS.perdu` (causes possibles), `shortcuts()` (raccourcis selon qui sert), `PRESETS` (règles officiel / amical).
3. **Moteur** : `replay(m, s, upTo)` rejoue le journal d'un set ; `rotate`, `matchState`, `heritage` (blessés et libéros re-désignés transmis entre sets).
4. **Règles** : `optBlocked`, `ineligible` (qui peut faire quoi selon sa zone), `detailBlocked`, `canSub`, `canExc`, `liberoLocked`, `benchFor`, `liberosDispo`.
5. **`seed()`** : l'équipe et le match d'exemple.
6. **État et réglages** (`js/interface.js`, comme 7 à 9, 11 et 12) : `MODE_PWA` (vrai si `window.__PWA__`), `db`, `ui`, `ensureSettings`.
7. **Thème** (`applyTheme`, `lisible`) et **fond animé** (filet flouté sur canvas, `bgDraw` / `bgLoop`).
8. **Tableaux de blocs modulables** : `WIDGETS`, `DEFAULT_LAYOUT`, `layout()`, `vBoard()`, glisser-déposer maison `initDrag()` (Pointer Events, sans bibliothèque).
9. **Vues** : `vEquipe`, `vMatch`, `vCompo`, `vLive` (blocs `w*`), `vRapport`, `vHistorique`, `vStats`, `vApparence`.
10. **Stats** (`js/stats.js`) : `computeStats`, `lossCat`, `constats`, `bars`.
11. **Sauvegarde** : `exportData`, `lireImport` (valide le fichier, refuse un schéma plus récent, appelle `migrer`), `fusionner`.
12. **Actions** : `act(a, v)`, déclenchée par délégation sur `[data-a]`. `commitPoint`, `nextStep`, `done()`.

Le rendu est simple : chaque action modifie `db` ou `ui`, puis `render()` reconstruit `#app` en entier. Les états de formulaire qui doivent survivre au rendu passent par `ui` ou par des `id` stables.

## Principe central : on ne stocke que le journal

Le score, la rotation, le serveur, les remplacements et les stats ne sont **jamais stockés**. On les recalcule en rejouant les événements du set (`replay`). Conséquences :
- **Annuler** = retirer le dernier événement.
- **Modifier un point** = remplacer l'événement. Le résultat gagné/perdu est conservé, pour ne pas décaler le score.
- `replay(m, s, i)` donne l'état juste avant l'événement `i` (serveur, positions), ce qui sert à la modification d'un point passé.

Ne jamais introduire de compteur stocké qui doublonnerait le journal.

## Format des données

Stockage : `localStorage['statsvolley.v1']`. Export : `{app:'stats-volley', format:1, version, exportedAt, db}`.

```
db = { schema, exemple, welcome, teamName, currentMatchId, lastExport,
  settings: { details:'off'|'serviceAttaque'|'all', noteRecep, theme:'dark'|'light'|'auto', c1, c2, bgAnim, hideInstall,
              layouts: { 'live-large':[{id,span,hidden}], 'live-compact':[...], 'rapport-large':[...], 'rapport-compact':[...] } },
  players: [{ id, prenom, nom, numero, poste, postes[], actif }],
  matches: [{ id, date, adversaire, type:'officiel'|'amical', forceFin,
    regles: { mode:'bestOf'|'fixe', setsGagnants, nombreSets, pointsParSet, pointsDernierSet, ecart, rempMax|null, tmMax|null },
    convocations: [{ id, playerId, numero, poste, libero }],
    sets: [{ numero, serviceInitial:'nous'|'adv', formation:[6 ids de convocation], liberoId, events:[...] }] }] }
```

**Positions** : tableau de 6 identifiants de convocation. **Index 0 = zone 1 (serveur)**, index 1 à 3 = zones 2 à 4 (rangée avant), index 4 et 5 = zones 5 et 6. Rotation au gain du service : `pos.push(pos.shift())`.

**Événements** (champ `type`) :
- `point` : `{resultat:'gagne'|'perdu', cause, camp:'nous'|'adversaire'|'inconnu', detail, joueurID, noteReception, taps, t}`
- `remplacement` : `{sortantID, entrantID}`, et `exceptionnel` (blessure) avec les mêmes champs
- `tempsMort` : `{camp:'nous'|'adv'}`. Attention : ici `'adv'`, alors que les points utilisent `'adversaire'`.
- `liberoIn` `{remplaceID, liberoID}`, `liberoOut`, `liberoSwap` `{liberoID}`, `liberoBlesse` `{liberoID, par}`, `liberoRedesigne` `{joueurID}`
- `correction` : `{zone, joueur}`, correction de composition, non comptée comme remplacement

**Version du schéma** : `db.schema` (actuellement `SCHEMA = 1`, dans `js/moteur.js`). Une base sans `schema` (app 1.0.x) est au schéma 1. `migrer(db)` est appelée au chargement et à l'import. Pour changer le format : incrémenter `SCHEMA`, ajouter `MIGRATIONS[ancien]`, qui transforme une base de `ancien` à `ancien + 1`, et un test qui charge une sauvegarde de l'ancien format (voir `tests/fixtures/`). Une sauvegarde d'un schéma plus récent est refusée à l'import et laissée intacte au chargement.

## Conventions de saisie (décidées avec Rémi, ne pas changer sans lui demander)

- Un point = **résultat**, puis **cause et camp décisif** (qui a fait l'action qui termine l'échange), puis **joueur**. `joueurID` désigne **toujours un joueur de notre équipe** : l'auteur, le fautif, ou celui qui a subi l'action. Les joueurs adverses ne sont jamais suivis.
- **Un ace adverse est toujours une faute de réception de notre côté** (`receptionRatee`, note 0 automatique), avec un choix « Collectif » pour un ballon tombé entre deux joueurs. Il n'y a pas d'option « ace adverse » séparée.
- **Une attaque adverse gagnante n'est pas forcément une faute** : le défenseur est facultatif.
- « **Je n'ai pas vu** » (`inconnue`) existe pour garder le score et la rotation justes quand un échange est raté.
- Les **précisions** sont désactivées par défaut. La **note de réception 3-2-1** est facultative et ne se propose que sur service adverse.
- Objectif d'ergonomie : **2 à 4 touches par point**. Le compteur `taps` est enregistré pour le mesurer.

## Règles de volley appliquées

- Sets de 25 points avec 2 points d'écart, set décisif à 15 (format « au meilleur »). En amical, les règles sont paramétrables.
- Officiel : 6 remplacements par set, système de paires titulaire/remplaçant (un titulaire ne revient qu'à la place de son remplaçant, une seule fois). Les corrections de position transfèrent le rôle de titulaire (`st.starters`).
- Éligibilité selon la zone (`ineligible`) : le contre est réservé à la rangée avant ; la 2e main gagnante aussi ; le libéro n'attaque pas ; la faute des 3 m et le contre d'un arrière concernent des arrières hors libéro ; la faute de position est collective.
- Libéro : il remplace un arrière, n'entre jamais en zone 1 quand on sert, sort automatiquement en arrivant en zone 4, et un échange doit être joué entre deux changements de libéro. Deux libéros maximum, échange entre libéros possible, libéro blessé, re-désignation quand plus aucun libéro n'est disponible.
- Remplacement exceptionnel (blessure) : non compté ; en officiel, seulement si aucun remplacement régulier n'est possible ; le blessé ne rejoue plus du match.

**Incertitudes connues** : ces règles viennent des règles FIVB, appliquées de mémoire. Elles n'ont **pas été vérifiées** contre le règlement FFVB / Compet'Lib, notamment pour la blessure et le libéro. Ce qui n'est pas géré : expulsion et disqualification, carton jaune.

## Contraintes techniques

- **Aucune dépendance externe chargée à l'exécution**, sauf les polices Google, mises en cache par le service worker. Pas de CDN, pas de framework, pas de build. L'app doit fonctionner hors ligne après la première ouverture.
- **Mobile d'abord** : cibles de 48 px minimum, boutons Gagné/Perdu de 100 px et plus, pas de défilement horizontal.
- **Accessibilité** : l'information n'est jamais portée par la couleur seule (signes + / −, libellés), contraste AA, `prefers-reduced-motion` respecté (le fond se fige).
- Vert et rouge sont réservés au sens gagné/perdu. Les couleurs du club passent par `lisible()` pour rester visibles sur le fond.
- **Disposition modulable** : verrouillée hors du mode « Personnaliser », et les blocs ne sont pas cliquables pendant l'édition, pour éviter les erreurs en match.

## Tester

**`node --test`** à la racine (Node 22 ou plus, aucune dépendance) lance toute la suite en une minute environ. La CI GitHub Actions fait de même à chaque push et à chaque pull request. **Toute modification doit garder la suite verte**, et tout bug corrigé reçoit son test.

- `tests/env.js` : charge les scripts **dans l'ordre où `index.html` les déclare**, dans un contexte `vm` avec un faux `document`, un faux `localStorage` et de faux `File` / `FileReader`. `env.act(a, v, champs)` agit comme un clic sur `[data-a]` (les `champs` remplissent les formulaires lus par l'action). `env.boutons()` liste les boutons affichés, grisés ou non, et `env.options(id)` les choix d'un `<select>`.
- `tests/outils.js` : équipe, match, set, saisie d'un point, et les **invariants** (`verifierMatch`) : 6 joueurs distincts sur le terrain, jamais de libéro en zone avant ni au service, jamais de blessé sur le terrain, jamais plus de remplacements que la limite, aucun point saisi avec une cause bloquée ou un joueur `ineligible`, score cohérent avec le journal et avec la fin de set.
- Un fichier par thème : `match`, `regles`, `remplacements`, `journal` (annuler, modifier, corriger), `sauvegarde`, `schema`, `version` (versions concordantes, tout fichier chargé présent dans le cache du service worker).
- `simulation.test.js` : 48 matchs aléatoires joués en cliquant au hasard sur les **boutons actifs** de l'écran, avec les invariants vérifiés après chaque action. Reproductible : `SIM_GRAINE=17 node --test tests/simulation.test.js` rejoue un match, et `SIM_MATCHS=250` en joue davantage.
- **Navigateur** (hors `node --test`) : `tests/e2e/verifier.js` (Playwright) sert l'app en local et vérifie, en 390 px puis en 1180 px : premier lancement, exemple, saisie, fin de set, compte rendu, rechargement hors ligne, export, import. Installer avec `npm install --no-save playwright && npx playwright install chromium`, puis lancer `node tests/e2e/verifier.js`. `NAVIGATEUR=chrome` utilise le Chrome installé (utile si le Chromium de Playwright est bloqué sur le poste), et `CAPTURES=dossier` garde les captures d'écran.

## Déployer une mise à jour

1. Modifier les fichiers et pousser sur `main`. GitHub Pages redéploie tout seul.
2. **Changer la version à trois endroits** : `V` dans `sw.js`, `APP_VERSION` dans `js/interface.js`, et les `?v=` de `index.html` (styles et scripts). Sans ça, les appareils gardent l'ancienne version en cache. `tests/version.test.js` échoue si les trois ne concordent pas, ou si un fichier chargé par la page manque dans `CORE`.
3. Les données des utilisateurs ne doivent jamais être perdues : toute évolution du format doit savoir lire les anciennes sauvegardes.

## Feuille de route (dans l'ordre proposé)

1. ~~**Base solide**~~ : fait en 1.1.0 (tests et CI, découpage sans build, `db.schema` et `migrer`).
2. **Stats de saison** : cumul et évolution par joueur sur tous les matchs, avec un filtre officiel/amical.
3. **Rotations R1 à R6 numérotées par la position du passeur**, à la place du « joueur en zone 1 ».
4. **Courbe du score par set**, avec les temps morts.
5. **Partage du compte rendu** (texte ou PDF) vers le groupe de l'équipe.
6. Plus tard, si besoin : synchronisation automatique entre appareils, plusieurs équipes, vérification des règles Compet'Lib.

**Écartés volontairement** : saisie vocale (gymnase trop bruyant), suivi des joueurs adverses, app iOS native tant que la PWA suffit, saisie de toutes les touches de balle (intenable en direct).
