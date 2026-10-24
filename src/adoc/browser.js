import { chromium } from 'playwright';
import { PATHS, ensureDir } from '../lib/config.js';

/**
 * Ouvre Chromium avec un profil dédié et persistant (.profiles/adoc) :
 * la connexion à Adoc faite une fois avec `npm run adoc:connexion` est réutilisée
 * ensuite, sans jamais stocker de mot de passe dans le projet.
 */
export async function openAdoc({ headless }) {
  ensureDir(PATHS.adocProfile);
  return chromium.launchPersistentContext(PATHS.adocProfile, {
    headless,
    acceptDownloads: true,
    locale: 'fr-FR',
    viewport: { width: 1280, height: 900 },
  });
}

/** Vrai si la page est bien dans l'application Adoc (et pas sur la page de connexion FFT). */
export function isInsideAdoc(page, baseUrl) {
  const url = page.url();
  return url.startsWith(baseUrl) && !/login|connexion|auth/i.test(url);
}
