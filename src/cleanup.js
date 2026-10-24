import fs from 'node:fs';
import { PATHS } from './lib/config.js';

// Supprime les exports et rapports (données personnelles) une fois la purge terminée.
// Le journal des retraits est conservé, il permet de reprendre une purge interrompue.
for (const dir of [PATHS.adocDir, PATHS.waDir, PATHS.rapportsDir]) {
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const f of [PATHS.aRetirer, PATHS.aRetirer.replace(/\.txt$/, '.precedent.txt')]) {
  fs.rmSync(f, { force: true });
}
console.log('✅ Exports Adoc, listes WhatsApp et rapports supprimés (le journal data/retraits.log est conservé).');
