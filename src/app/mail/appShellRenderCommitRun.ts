/**
 * Remplace le shell sans détruire la colonne de lecture quand son HTML n’a pas changé.
 * Les rendus de fond (brief, cache, compteurs, sync) ne reconstruisent alors pas le fil :
 * le shadow DOM des messages et le défilement restent en place.
 *
 * `commitAppShellHtml` détache la colonne conservée et pose le nouveau HTML.
 * `restoreParkedMain` la réinsère après le câblage, pour que les écouteurs
 * ne soient pas posés une seconde fois sur le fil déjà affiché.
 */

let lastThreadMainHtml = "";

export function resetAppShellMainCache(): void {
  lastThreadMainHtml = "";
}

export function commitAppShellHtml(
  root: HTMLElement,
  fullHtml: string,
  mainHtml: string,
  parkThreadMain: boolean,
): HTMLElement | null {
  const existing = root.querySelector("main.main");
  const park =
    parkThreadMain &&
    mainHtml.length > 0 &&
    mainHtml === lastThreadMainHtml &&
    existing instanceof HTMLElement;
  const parked = park ? existing : null;
  parked?.remove();
  root.innerHTML = fullHtml;
  if (parkThreadMain) lastThreadMainHtml = mainHtml;
  else lastThreadMainHtml = "";
  return parked;
}

export function restoreParkedMain(root: HTMLElement, parked: HTMLElement | null): void {
  if (!parked) return;
  const fresh = root.querySelector("main.main");
  if (fresh) fresh.replaceWith(parked);
  else root.appendChild(parked);
}
