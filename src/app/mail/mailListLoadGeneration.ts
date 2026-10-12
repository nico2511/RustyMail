import { currentAccount } from "../core/accountContext";
import { state } from "../state";

/**
 * Garde « requête courante » pour `list_threads` : une réponse tardive (dossier quitté,
 * rechargement plus récent) ne doit pas écraser `state.threads`.
 */
let mailListLoadGen = 0;

export type MailListLoadToken = { gen: number; scope: string };

/** Dossier / compte / filtre que la liste affiche — comparé à la fin de la requête. */
export function mailListScopeKey(): string {
  const fm = state.view === "folderManager" ? (state.folderManager.selectedMailbox ?? "").trim() : "";
  return JSON.stringify([
    currentAccount()?.id ?? "",
    state.selectedMailbox ?? "",
    fm,
    state.listFilter,
  ]);
}

/** Un chargement complet (non `append`) invalide les requêtes plus anciennes. */
export function beginMailListLoad(append: boolean): MailListLoadToken {
  if (!append) mailListLoadGen += 1;
  return { gen: mailListLoadGen, scope: mailListScopeKey() };
}

export function isMailListLoadCurrent(token: MailListLoadToken): boolean {
  return token.gen === mailListLoadGen && token.scope === mailListScopeKey();
}
