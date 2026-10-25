import { loadConfig } from '../lib/config.js';
import { attach, closeChrome, launchChrome } from './browser.js';

const { url: base, portDebug: port, navigateur } = loadConfig().adoc;

console.log('Ouverture de Chrome sur Adoc…');
const proc = await launchChrome({ url: `${base}accueil.do?method=read`, port, browserPath: navigateur });

const { browser } = await attach({ port, base });
console.log('✅ Connecté à Adoc. La session est enregistrée dans le profil Chrome du bot.');
await closeChrome(browser, proc);
process.exit(0);
