import readline from 'node:readline/promises';
import { PATHS, loadConfig, readNumberList } from '../lib/config.js';
import { formatKey } from '../lib/phone.js';
import { findGroup, isMeAdmin, readMembers, startWhatsApp, closeWhatsApp } from './client.js';
import { appendJournal, planRemoval, readJournal, recentRemovals } from './plan.js';
import { configuredGroups, mergeMembers } from './groups.js';

const config = loadConfig();
const appliquer = process.argv.includes('--appliquer');
const { parLot, pauseMinSecondes, pauseMaxSecondes, maxParExecution, maxPar24h } = config.retrait;

const lignes = readNumberList(PATHS.aRetirer);
if (!lignes.length) {
  console.log('La liste data/a-retirer.txt est vide : rien à faire.');
  console.log('→ Lancez `npm run preparer`, relisez le rapport puis la liste, et recommencez.');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => 1000 * (pauseMinSecondes + Math.random() * (pauseMaxSecondes - pauseMinSecondes));

async function main(client) {
  // Chargement des groupes configurés ; il faut être admin de chacun.
  const groups = new Map();
  for (const nom of configuredGroups(config.whatsapp)) {
    const g = await findGroup(client, nom);
    if (!(await isMeAdmin(client, g))) {
      throw new Error(`Le compte connecté n'est pas admin du groupe « ${g.name} » : impossible de retirer des membres.`);
    }
    groups.set(g.id._serialized, g);
  }
  const groupes = [];
  for (const g of groups.values()) groupes.push({ nom: g.name, id: g.id._serialized, membres: await readMembers(client, g) });
  const plusieurs = groupes.length > 1;

  const journal = readJournal(PATHS.journalRetraits);
  const recent = recentRemovals(journal);
  // maxPar24h vide (null) : pas de plafond sur 24 h.
  const quota = maxPar24h ? Math.max(0, Math.min(maxParExecution, maxPar24h - recent.count)) : maxParExecution;

  const plan = planRemoval({
    lignes,
    membres: mergeMembers(groupes),
    journal,
    listeBlanche: readNumberList(PATHS.listeBlanche),
    max: quota,
  });

  console.log('');
  for (const g of groupes) console.log(`Groupe « ${g.nom} » : ${g.membres.length} membres.`);
  console.log(`  ${plan.aRetirer.length} personne(s) à retirer maintenant`);
  if (plan.reportes.length) {
    const jour = maxPar24h ? `, ${maxPar24h} par 24 h ; ${recent.count} déjà retirés ces dernières 24 h` : '';
    console.log(`  ${plan.reportes.length} reportés à la prochaine séance (max ${maxParExecution} par séance${jour})`);
  }
  if (maxPar24h && quota === 0 && plan.reportes.length) {
    const h = recent.libereA?.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    console.log(`\n⏸️  Limite de ${maxPar24h} retraits par 24 h atteinte. Prochain retrait possible : ${h}.`);
  }
  if (plan.dejaPartis.length) console.log(`  ${plan.dejaPartis.length} déjà absents ${plusieurs ? 'des groupes' : 'du groupe'}`);
  if (plan.dejaFaits.length) console.log(`  ${plan.dejaFaits.length} déjà retirés lors d'une exécution précédente`);
  for (const p of plan.proteges) console.log(`  ⚠️  ${formatKey(p.numero)} ignoré : ${p.raison}`);
  const nbContacts = plan.aRetirer.filter((r) => r.contact).length;
  if (nbContacts) console.log(`  dont ${nbContacts} de vos contacts, retirés en dernier`);

  if (!plan.aRetirer.length) return;

  const operations = plan.aRetirer.reduce((n, r) => n + r.groupes.length, 0);
  const minutes = Math.round((operations * ((pauseMinSecondes + pauseMaxSecondes) / 2 + 5)) / parLot / 60);
  const rythme = parLot === 1 ? 'Un retrait à la fois' : `Par lots de ${parLot}`;
  const detailOps = operations > plan.aRetirer.length ? ` (${operations} retraits au total, certains étant dans plusieurs groupes)` : '';
  console.log(`\n${rythme}, avec ${pauseMinSecondes} à ${pauseMaxSecondes} s de pause : environ ${minutes} min${detailOps}.`);

  const ou = (r) => (plusieurs ? `  [${r.groupes.map((g) => g.nom).join(', ')}]` : '');
  if (!appliquer) {
    console.log('\nSIMULATION : personne n\'a été retiré. Premiers numéros concernés :');
    for (const r of plan.aRetirer.slice(0, 10)) {
      console.log(`  - ${formatKey(r.numero)}  ${r.nom}${r.contact ? '  (contact)' : ''}${ou(r)}`);
    }
    console.log('\nPour retirer pour de vrai : npm run wa:retirer -- --appliquer');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nTapez RETIRER pour retirer ${plan.aRetirer.length} personnes : `);
  rl.close();
  if (answer.trim() !== 'RETIRER') {
    console.log('Annulé, personne n\'a été retiré.');
    return;
  }

  // Une opération = retirer une personne d'un groupe. Les pauses s'appliquent entre chaque lot d'opérations.
  const ops = plan.aRetirer.flatMap((r) => r.groupes.map((g) => ({ r, groupeId: g.groupeId ?? [...groups.keys()][0], id: g.id })));
  const restants = new Map(plan.aRetirer.map((r) => [r.numero, r.groupes.length]));
  let retires = 0;
  let echec = false;

  for (let i = 0; i < ops.length && !echec; i += parLot) {
    const lot = ops.slice(i, i + parLot);
    const parGroupe = new Map();
    for (const op of lot) parGroupe.set(op.groupeId, [...(parGroupe.get(op.groupeId) ?? []), op]);

    for (const [groupeId, lotGroupe] of parGroupe) {
      await groups.get(groupeId).removeParticipants(lotGroupe.map((op) => op.id));
    }
    await sleep(5000);

    // Vérification : on relit chaque groupe concerné et on contrôle que chacun est bien parti.
    for (const [groupeId, lotGroupe] of parGroupe) {
      const g = await findGroup(client, groupeId);
      groups.set(groupeId, g);
      const encore = new Set(g.participants.map((p) => p.id._serialized));
      for (const op of lotGroupe) {
        const label = `${formatKey(op.r.numero)}${plusieurs ? ` de « ${g.name} »` : ''}`;
        if (encore.has(op.id)) {
          appendJournal(PATHS.journalRetraits, op.r.numero, 'echec', `${op.r.nom} [${g.name}]`);
          console.log(`  ❌ ${label} : toujours présent`);
          echec = true;
          continue;
        }
        console.log(`  ✅ ${label} retiré`);
        const reste = restants.get(op.r.numero) - 1;
        restants.set(op.r.numero, reste);
        if (reste === 0) {
          // Journalisé une fois la personne retirée de tous ses groupes.
          appendJournal(PATHS.journalRetraits, op.r.numero, 'retire', `${op.r.nom}${ou(op.r)}`);
          retires += 1;
        }
      }
    }

    if (echec) {
      // Un retrait refusé peut signaler une restriction de WhatsApp : on n'insiste pas.
      console.log('\n⛔ Un retrait n\'a pas abouti : arrêt par prudence. Vérifiez le groupe sur votre téléphone avant de relancer, idéalement le lendemain.');
    } else if (i + parLot < ops.length) {
      const ms = pause();
      console.log(`  … pause de ${Math.round(ms / 1000)} s`);
      await sleep(ms);
    }
  }

  console.log(`\n✅ ${retires} personne(s) retirée(s). Journal : data/retraits.log`);
  const reste = plan.aRetirer.length - retires + plan.reportes.length;
  if (reste > 0) console.log(`Il en reste ${reste} : relancez la commande pour une nouvelle séance (de préférence quelques heures plus tard).`);
}

const client = await startWhatsApp({ allowQr: false });
try {
  await main(client);
} finally {
  await closeWhatsApp(client);
}
process.exit(0);
