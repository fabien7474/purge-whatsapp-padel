# Purge du groupe WhatsApp padel — Annecy Tennis

Compare les membres du groupe WhatsApp padel à la liste des **adhérents en cours** exportée d'Adoc,
produit un rapport, puis retire du groupe, **après votre validation**, ceux qui n'ont pas renouvelé.

Rien n'est retiré automatiquement : le bot prépare une liste, vous la relisez, puis vous lancez le retrait.

## Comment ça marche

| Étape | Commande | Ce qui se passe |
|---|---|---|
| 1 | *(à la main dans Adoc)* | Vous exportez la liste des adhérents en cours (fichier Excel). |
| 2 | `npm run adoc:importer -- <fichier>` | Lit l'export, repère les colonnes de téléphone et normalise les numéros. |
| 3 | `npm run wa:membres` | Se connecte à WhatsApp Web avec le téléphone admin et lit la liste des membres du ou des groupes. |
| 4 | `npm run rapport` | Rapproche les deux listes et produit le rapport et `data/a-retirer.txt`. |
| 5 | `npm run wa:retirer` | Simulation : montre ce qui serait fait, sans rien toucher. |
| 6 | `npm run wa:retirer -- --appliquer` | Retire pour de vrai, une personne à la fois et lentement (de tous ses groupes), après avoir tapé `RETIRER`. |

`npm run preparer` enchaîne les étapes 3 et 4.

### Les catégories du rapport

- **Adhérent** : le numéro WhatsApp figure dans la fiche d'un adhérent de la saison (portable, fixe ou numéro d'un responsable légal).
- **Conservé** : le compte du bot, ou un numéro de `liste-blanche.txt` (enseignants, salariés…).
- **À vérifier** : numéro masqué par WhatsApp, admin du groupe absent d'Adoc, ou nom WhatsApp qui correspond à un adhérent mais avec un autre numéro (changement de numéro, inscription avec le numéro d'un proche). Ces membres ne sont jamais retirés automatiquement.
- **À retirer** : aucun lien avec un adhérent de la saison. Ce sont eux qui vont dans `data/a-retirer.txt`.

Les portables suisses saisis sans indicatif (`079…`) sont reconnus.

## Installation (une seule fois)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus, et Git.

```bash
git clone https://github.com/fabien7474/purge-whatsapp-padel.git
cd purge-whatsapp-padel
npm install
cp config.example.json config.json
cp liste-blanche.example.txt liste-blanche.txt
```

Sous Windows, remplacez `cp` par `copy`.

Dans `config.json`, indiquez le ou les groupes à purger dans `whatsapp.groupes` (le nom, ou l'identifiant `…@g.us` affiché par `npm run wa:connexion`) :

```json
"whatsapp": { "groupes": ["Padel Annecy Tennis", "Padel Annecy Tennis - Annonces"] }
```

Avec plusieurs groupes, les membres sont comparés à la même liste d'adhérents, le rapport et `data/a-retirer.txt` sont communs, et chaque personne est retirée de tous les groupes configurés où elle se trouve. Le compte lié doit être admin de chacun.

### Connexion à WhatsApp

```bash
npm run wa:connexion
```

Scannez le QR code avec le téléphone **admin du groupe** (WhatsApp › Réglages › Appareils connectés). La commande affiche ensuite vos groupes, indique si ceux de `config.json` sont bien trouvés, et si le compte en est admin. La session est gardée dans `.wwebjs_auth/` : il n'est pas nécessaire de rescanner à chaque fois.

> **Conseil** : utilisez un numéro dédié au club (une carte SIM à bas prix) nommé admin du groupe, plutôt que votre numéro personnel. Voir « Risques » plus bas.

### Groupes d'une communauté WhatsApp

Retirer quelqu'un d'un groupe ne le retire pas de la communauté, et le retirer de la communauté ne le retire pas des groupes. Il faut donc traiter les deux.

Tous les membres d'une communauté sont dans son **groupe d'annonces**. `npm run wa:connexion` le signale par « [annonces de la communauté …] » ; il porte souvent le même nom que la communauté. Ajoutez son identifiant (`…@g.us`) à la liste des groupes : retirer quelqu'un de ce groupe d'annonces le retire de la communauté.

```json
"whatsapp": {
  "groupes": ["Padel Annecy Tennis", "Nom de l'autre groupe", "120363…@g.us"]
}
```

À vérifier une première fois sur une seule personne : après son retrait, contrôlez sur votre téléphone qu'elle n'apparaît plus dans les membres de la communauté.

## Utilisation (environ deux fois par an)

1. Prévenez le groupe quelques semaines avant (« les non-adhérents seront retirés le … »).
2. **Export Adoc** : depuis la page d'accueil d'Adoc, ouvrez la liste des **adhérents en cours** (ou *Adhérents › Gestion*, recherche avec l'année d'adhésion de la saison), puis cliquez sur **Exporter**. Vous obtenez un fichier `export.xls`.
3. **Import** :
   ```bash
   npm run adoc:importer -- ~/Téléchargements/export.xls
   ```
   Vous pouvez aussi déposer le fichier dans `data/adoc/` et lancer `npm run adoc:importer` sans chemin : le fichier le plus récent est pris.
   La commande affiche les colonnes trouvées : vérifiez que les colonnes de téléphone sont les bonnes. Sinon, forcez-les dans `config.json` › `adoc.colonnes` (par exemple `"telephones": ["Téléphone portable", "Téléphone portable du responsable légal"]`).
4. `npm run preparer`
5. Ouvrez `data/rapports/rapport-AAAA-MM-JJ.html` dans votre navigateur. Traitez les **À vérifier** : ajoutez à `data/a-retirer.txt` ceux à retirer, ou à `liste-blanche.txt` ceux à garder.
6. Relisez `data/a-retirer.txt` et supprimez toute ligne de quelqu'un qui doit rester.
7. `npm run wa:retirer` (simulation), puis `npm run wa:retirer -- --appliquer`.
8. Une **séance** = une exécution de `npm run wa:retirer -- --appliquer`. Elle retire au plus 40 personnes, une par une, en 50 minutes environ. S'il en reste, relancez la commande pour une nouvelle séance : elle reprend où elle s'était arrêtée (journal `data/retraits.log`). Laissez de préférence quelques heures entre deux séances (par exemple une le matin, une le soir).
9. Une fois terminé : `npm run nettoyer` pour supprimer l'export, les listes et les rapports. Pensez aussi à supprimer le fichier `export.xls` de votre dossier Téléchargements.

### Rythme de retrait

Assez lent pour ne pas attirer l'attention de WhatsApp. Réglages dans `config.json` › `retrait` :

| Réglage | Valeur | Rôle |
|---|---|---|
| `pauseMinSecondes` / `pauseMaxSecondes` | 45 / 110 | pause aléatoire entre deux personnes |
| `pauseEntreGroupesMinSecondes` / `pauseEntreGroupesMaxSecondes` | 5 / 20 | pause aléatoire entre les groupes d'une même personne |
| `maxParExecution` | 40 | retraits par séance (≈ 50 min) |
| `maxPar24h` | `null` | plafond facultatif sur 24 heures glissantes, toutes séances confondues (`null` = pas de plafond) |

Les personnes enregistrées dans les **contacts du téléphone lié au bot** sont retirées en dernier : elles sont placées en fin de `data/a-retirer.txt` (marquées « dans vos contacts ») et ne passent qu'une fois tous les inconnus retirés. Cela laisse le temps de prévenir personnellement ceux que vous connaissez.

Si un retrait n'aboutit pas, la séance s'arrête aussitôt : vérifiez le groupe sur votre téléphone et attendez le lendemain.

## Sur le Beelink (Linux + Docker)

Tout tourne dans un conteneur Docker : rien à installer à part Docker et Git. Les données restent dans le dossier du projet.

### Installation (une seule fois)

```bash
docker --version && docker compose version   # Docker déjà installé ? Sinon :
# sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
#   (dépôt officiel Docker ; ne pas mélanger avec le paquet docker.io d'Ubuntu, qui entre en conflit)
sudo usermod -aG docker $USER      # puis se déconnecter / reconnecter
git clone https://github.com/fabien7474/purge-whatsapp-padel.git
cd purge-whatsapp-padel
docker compose build
```

Recopiez depuis l'ancien ordinateur, dans le même dossier : `config.json`, `liste-blanche.txt` et `data/retraits.log` (le journal, pour que les personnes déjà retirées ne soient pas retraitées).

### Utilisation

Le raccourci `./purge` remplace `npm run` :

| Sur le PC | Sur le Beelink |
|---|---|
| `npm run wa:connexion` | `./purge wa:connexion` |
| `npm run adoc:importer -- fichier.xls` | déposer l'export dans `import/`, puis `./purge adoc:importer` |
| `npm run preparer` | `./purge preparer` |
| `npm run wa:retirer -- --appliquer` | `./purge wa:retirer -- --appliquer` |
| `npm run nettoyer` | `./purge nettoyer` |

La session WhatsApp ne se copie pas : la première fois, `./purge wa:connexion` affiche un QR code à scanner avec le téléphone admin. Retirez ensuite l'ancien ordinateur dans WhatsApp › Appareils connectés.

Après une mise à jour du code : `git pull && docker compose build`.

Le rapport HTML est dans `data/rapports/` : ouvrez-le avec le navigateur du Beelink.

## Risques et précautions

- **WhatsApp** : il n'existe pas d'API officielle pour gérer un groupe de cette taille. Le bot passe par WhatsApp Web (bibliothèque [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)), ce que les conditions de WhatsApp n'autorisent pas. Le risque est une suspension du numéro utilisé, surtout en cas de retraits massifs. D'où les précautions : numéro dédié, une personne à la fois, pauses aléatoires, plafond quotidien, arrêt au premier échec. La simple lecture des membres est peu risquée.
- **Données personnelles** : tout reste sur l'ordinateur. Le dossier `data/` et la session WhatsApp sont exclus de Git (`.gitignore`). Ne committez jamais ces fichiers. Adoc rappelle que ces données ne doivent servir qu'à votre mission au club.
- **Le bot ne retire jamais** : un admin du groupe, son propre compte, un numéro de la liste blanche.

## Tests

```bash
npm test
```

Les tests utilisent uniquement des données fictives.
