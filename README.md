# Purge du groupe WhatsApp padel — Annecy Tennis

Compare les membres du groupe WhatsApp padel à la liste des **adhérents en cours** dans Adoc,
produit un rapport, puis retire du groupe, **après votre validation**, ceux qui n'ont pas renouvelé.

Rien n'est retiré automatiquement : le bot prépare une liste, vous la relisez, puis vous lancez le retrait.

## Comment ça marche

| Étape | Commande | Ce qui se passe |
|---|---|---|
| 1 | `npm run adoc:export` | Ouvre Adoc dans votre Chrome (connexion manuelle si la session a expiré), lance l'**Export** des *Adhérents en cours*, lit le fichier Excel et normalise les numéros. |
| 2 | `npm run wa:membres` | Se connecte à WhatsApp Web avec le téléphone admin et lit la liste des membres du groupe. |
| 3 | `npm run rapport` | Rapproche les deux listes et produit le rapport + `data/a-retirer.txt`. |
| 4 | `npm run wa:retirer` | Simulation : montre ce qui serait fait, sans rien toucher. |
| 5 | `npm run wa:retirer -- --appliquer` | Retire pour de vrai, par petits lots, après avoir tapé `RETIRER`. |

`npm run preparer` enchaîne les étapes 1 à 3.

### Les catégories du rapport

- **Adhérent** : le numéro WhatsApp figure dans la fiche d'un adhérent de la saison (portable, fixe ou numéro d'un responsable légal).
- **Conservé** : le compte du bot, ou un numéro de `liste-blanche.txt` (enseignants, salariés…).
- **À vérifier** : numéro masqué par WhatsApp, admin du groupe absent d'Adoc, ou nom WhatsApp qui correspond à un adhérent mais avec un autre numéro (changement de numéro, inscription avec le numéro d'un proche). Jamais retirés automatiquement.
- **À retirer** : aucun lien avec un adhérent de la saison. Ce sont eux qui vont dans `data/a-retirer.txt`.

Les portables suisses saisis sans indicatif (`079…`) sont reconnus.

## Installation (une seule fois)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus, Git, et Google Chrome (ou Microsoft Edge).

```bash
git clone https://github.com/fabien7474/purge-whatsapp-padel.git
cd purge-whatsapp-padel
npm install
cp config.example.json config.json
cp liste-blanche.example.txt liste-blanche.txt
```

Sous Windows, remplacez `cp` par `copy`.

Dans `config.json`, mettez le **nom exact** du groupe dans `whatsapp.groupe`.

### Connexion à Adoc

```bash
npm run adoc:connexion
```

Une fenêtre **Chrome** s'ouvre sur Adoc : connectez-vous normalement (identifiant, mot de passe, captcha). Elle se ferme toute seule une fois que vous êtes dans Adoc.

Le site de la FFT bloque les navigateurs pilotés par un robot au moment de la connexion. Le bot ne cherche pas à contourner cette protection : il ouvre votre vrai Chrome, avec un profil dédié (`.profiles/adoc-chrome/`, distinct de votre profil habituel), et ne s'y attache qu'**après** votre connexion pour lancer l'export. Aucun mot de passe n'est stocké dans le projet.

Si la session a expiré, `npm run adoc:export` rouvre simplement la fenêtre et attend que vous vous reconnectiez. Si Chrome n'est pas trouvé automatiquement, indiquez son chemin dans `config.json` › `adoc.navigateur`.

### Connexion à WhatsApp

```bash
npm run wa:connexion
```

Scannez le QR code avec le téléphone **admin du groupe** (WhatsApp › Réglages › Appareils connectés). La commande affiche ensuite vos groupes et indique si celui de `config.json` est bien trouvé.

> **Conseil** : utilisez un numéro dédié au club (une carte SIM à bas prix) nommé admin du groupe, plutôt que votre numéro personnel. Voir « Risques » plus bas.

## Utilisation chaque saison

1. Prévenez le groupe quelques semaines avant (« les non-adhérents seront retirés le … »).
2. `npm run preparer`
3. Ouvrez `data/rapports/rapport-AAAA-MM-JJ.html` dans votre navigateur. Traitez les **À vérifier** : ajoutez à `data/a-retirer.txt` ceux à retirer, ou à `liste-blanche.txt` ceux à garder.
4. Relisez `data/a-retirer.txt` et supprimez toute ligne de quelqu'un qui doit rester.
5. `npm run wa:retirer` (simulation), puis `npm run wa:retirer -- --appliquer`.
6. Le retrait s'arrête après 40 personnes par exécution : relancez la même commande le lendemain, il reprend où il s'était arrêté (journal `data/retraits.log`).
7. Une fois terminé : `npm run nettoyer` pour supprimer les exports et rapports.

Réglages du rythme dans `config.json` › `retrait` : taille des lots, pauses, plafond par exécution.

Si la détection automatique des colonnes de l'export Adoc se trompe, forcez-les dans `config.json` › `adoc.colonnes` (les noms de colonnes sont affichés par `npm run adoc:export`).

## Risques et précautions

- **WhatsApp** : il n'existe pas d'API officielle pour gérer un groupe de cette taille. Le bot passe par WhatsApp Web (bibliothèque [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)), ce que les conditions de WhatsApp n'autorisent pas. Le risque est une suspension du numéro utilisé, surtout en cas de retraits massifs. D'où : numéro dédié, petits lots, pauses aléatoires, plafond quotidien. La lecture des membres seule est peu risquée.
- **Données personnelles** : tout reste sur l'ordinateur. Le dossier `data/` et les sessions de connexion sont exclus de Git (`.gitignore`). Ne committez jamais ces fichiers. Adoc rappelle que ces données ne servent qu'à la mission au club.
- **Le bot ne retire jamais** : un admin du groupe, son propre compte, un numéro de la liste blanche.

## Tests

```bash
npm test
```

Les tests utilisent uniquement des données fictives.
