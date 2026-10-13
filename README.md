# Stats Volley

Application web installable (PWA) pour suivre les statistiques d'une équipe de volley en match : effectif, convocation, composition du six, saisie point par point, compte rendu à chaque fin de set.

- Fonctionne sur iPhone, iPad, Android et PC, **sans réseau** après la première ouverture.
- Les données restent **sur l'appareil**. Rien n'est envoyé sur Internet.
- Sauvegarde par fichier (export / import) pour mettre les données à l'abri ou les passer d'un appareil à l'autre.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | La page de l'application. |
| `styles.css`, `js/` | Styles, moteur de règles (`moteur.js`), statistiques (`stats.js`) et interface (`interface.js`). Pas d'étape de build : les fichiers sont servis tels quels. |
| `tests/` | Tests automatiques : `node --test` à la racine (Node 22 ou plus). GitHub Actions les lance aussi à chaque envoi. |
| `manifest.webmanifest` | Nom, icônes et couleurs pour l'installation sur l'écran d'accueil. |
| `sw.js` | Service worker : mise en cache pour l'usage hors ligne. |
| `icons/` | Icônes de l'app. |
| `.nojekyll` | Indique à GitHub Pages de servir les fichiers tels quels. |
| `ios-natif/Modele.swift` | Modèle de données Swift, pour une éventuelle app iOS native plus tard. Non utilisé par la PWA. |

## Mise en ligne sur GitHub Pages (une seule fois)

1. Sur GitHub, ouvre le dépôt, puis **Settings** → **Pages**.
2. Dans **Build and deployment**, choisis **Source : Deploy from a branch**.
3. Choisis la branche **main** et le dossier **/ (root)**, puis **Save**.
4. Après une minute environ, l'adresse s'affiche en haut de la page, du type `https://<ton-utilisateur>.github.io/<nom-du-depot>/`.

Le dépôt doit être **public** pour utiliser GitHub Pages avec un compte gratuit. Le code est alors visible, mais **pas tes données**, qui restent sur tes appareils.

## Installation sur les appareils

- **iPhone / iPad** : ouvre l'adresse dans **Safari**, bouton **Partager**, puis **Sur l'écran d'accueil**.
- **Android** : ouvre l'adresse dans **Chrome**, menu **⋮**, puis **Installer l'application**.
- **PC** : ouvre l'adresse dans Chrome ou Edge, puis clique sur l'icône d'installation dans la barre d'adresse.

Ouvre l'app une première fois **avec du réseau** : c'est à ce moment qu'elle se met en cache pour le hors ligne.

## Sauvegarde

Dans **Historique** → **Sauvegarde** :

- **Exporter** crée un fichier `stats-volley-AAAA-MM-JJ.json`. Sur iPhone et iPad, la feuille de partage s'ouvre (AirDrop, Fichiers, mail…).
- **Importer** propose deux choix :
  - **Ajouter ce qui manque** : garde les données de l'appareil et ajoute les joueurs et matchs absents. C'est le bon choix pour regrouper deux appareils.
  - **Tout remplacer** : efface ce qui est sur l'appareil et met la sauvegarde à la place.

L'app rappelle de sauvegarder si la dernière sauvegarde date de plus de 7 jours. Chaque appareil garde ses propres données : il n'y a pas de synchronisation automatique.

## Mettre à jour l'app

1. Remplace les fichiers modifiés dans le dépôt.
2. Change le numéro de version à trois endroits : `const V = '1.1.0';` dans `sw.js`, `APP_VERSION` dans `js/interface.js`, et les `?v=1.1.0` de `index.html`. Le test `tests/version.test.js` vérifie qu'ils concordent.
3. Les appareils récupèrent la nouvelle version à la prochaine ouverture avec du réseau. Si besoin, ferme complètement l'app et rouvre-la.

Les données ne sont pas touchées par une mise à jour.
