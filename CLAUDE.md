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
| `index.html` | Toute l'app : CSS, moteur de règles, interface. Vanilla JS, aucun framework, aucune étape de build. |
| `sw.js` | Service worker : cache de l'app (réseau d'abord pour la page, cache d'abord pour le reste) et cache des polices Google. |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil. |
| `.nojekyll` | GitHub Pages sert les fichiers tels quels. |
| `ios-natif/Modele.swift` | Modèle SwiftData écrit pour une éventuelle app native. **Référence seulement, plus maintenu, en partie désynchronisé** du JS. |

### Organisation de `index.html` (dans l'ordre)

1. **CSS** : tokens sur `:root` (thème sombre par défaut), surcharges `body[data-mode="light"]` et `body[data-mode="auto"]`. Couleurs du club en `--c1` et `--c2`, injectées par JS.
2. **Catalogue** : `POSTES`, `CAT_LABEL`, `CAUSE_CAT`, `DET` (précisions), `OPTIONS.gagne` / `OPTIONS.perdu` (causes possibles), `shortcuts()` (raccourcis selon qui sert), `PRESETS` (règles officiel / amical).
3. **Moteur** : `replay(m, s, upTo)` rejoue le journal d'un set ; `rotate`, `matchState`, `heritage` (blessés et libéros re-désignés transmis entre sets).
4. **Règles** : `optBlocked`, `ineligible` (qui peut faire quoi selon sa zone), `detailBlocked`, `canSub`, `canExc`, `liberoLocked`, `benchFor`, `liberosDispo`.
5. **`seed()`** : l'équipe et le match d'exemple.
6. **État et réglages** : `MODE_PWA` (vrai si `window.__PWA__`), `db`, `ui`, `ensureSettings`.
7. **Thème** (`applyTheme`, `lisible`) et **fond animé** (filet flouté sur canvas, `bgDraw` / `bgLoop`).
8. **Tableaux de blocs modulables** : `WIDGETS`, `DEFAULT_LAYOUT`, `layout()`, `vBoard()`, glisser-déposer maison `initDrag()` (Pointer Events, sans bibliothèque).
9. **Vues** : `vEquipe`, `vMatch`, `vCompo`, `vLive` (blocs `w*`), `vRapport`, `vHistorique`, `vStats`, `vApparence`.
10. **Stats** : `computeStats`, `lossCat`, `constats`, `bars`.
11. **Sauvegarde** : `exportData`, `lireImport`, `fusionner`.
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
db = { exemple, welcome, teamName, currentMatchId, lastExport,
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

Il n'y a **pas encore de numéro de version du schéma** dans `db`. À ajouter avant tout changement de format (voir la feuille de route).

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

Il n'y a pas encore de suite de tests dans le dépôt (c'est le premier chantier de la feuille de route). La méthode utilisée jusqu'ici :
- extraire le script de `index.html` et le lancer dans Node avec un faux `document` et un faux `localStorage` ;
- simuler des dizaines de matchs aléatoires en appelant `act()` et les fonctions du moteur ;
- vérifier après chaque action ces invariants : toujours 6 joueurs distincts sur le terrain, jamais de libéro en zone avant ni au service, jamais de blessé sur le terrain, jamais plus de remplacements que la limite, aucun joueur désigné qui serait `ineligible` ;
- pour le rendu et le hors ligne : Playwright (Chromium) avec un serveur local `python3 -m http.server`.

## Déployer une mise à jour

1. Modifier les fichiers et pousser sur `main`. GitHub Pages redéploie tout seul.
2. **Changer `VERSION` dans `sw.js`** (ex. `sv-1.0.0` → `sv-1.0.1`), et `APP_VERSION` dans `index.html`. Sans ça, les appareils gardent l'ancienne version en cache.
3. Les données des utilisateurs ne doivent jamais être perdues : toute évolution du format doit savoir lire les anciennes sauvegardes.

## Feuille de route (dans l'ordre proposé)

1. **Base solide** : tests automatiques dans le dépôt (simulation de matchs et invariants, éventuellement via GitHub Actions), découpage de `index.html` en fichiers (moteur, interface, styles) **sans build**, version du schéma de données avec migration.
2. **Stats de saison** : cumul et évolution par joueur sur tous les matchs, avec un filtre officiel/amical.
3. **Rotations R1 à R6 numérotées par la position du passeur**, à la place du « joueur en zone 1 ».
4. **Courbe du score par set**, avec les temps morts.
5. **Partage du compte rendu** (texte ou PDF) vers le groupe de l'équipe.
6. Plus tard, si besoin : synchronisation automatique entre appareils, plusieurs équipes, vérification des règles Compet'Lib.

**Écartés volontairement** : saisie vocale (gymnase trop bruyant), suivi des joueurs adverses, app iOS native tant que la PWA suffit, saisie de toutes les touches de balle (intenable en direct).
