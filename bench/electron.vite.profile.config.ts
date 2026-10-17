import base from '../electron.vite.config'

/**
 * Build de profilage : même app, interface non minifiée et avec cartes de sources, pour que les
 * profils CPU (BENCH_PROFILE) nomment les vraies fonctions. Écrase out/ : relancer le build normal après.
 *   npx electron-vite build -c bench/electron.vite.profile.config.ts
 */
export default {
  ...base,
  renderer: { ...base.renderer, build: { minify: false, sourcemap: true } },
}
