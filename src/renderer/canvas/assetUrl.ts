/** URL servie par le principal pour une image du dossier du document. */
export function assetUrl(src: string): string {
  return `masset://doc/${src.split('/').map(encodeURIComponent).join('/')}`
}
