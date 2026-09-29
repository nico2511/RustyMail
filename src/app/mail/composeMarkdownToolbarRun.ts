import { applyComposeToolbarCommand } from "./composeBodyEditor";

/** Boutons `data-md` de la barre Écrire — commandes TipTap. */
export async function applyMarkdownAction(action: string): Promise<void> {
  await applyComposeToolbarCommand(action);
}
