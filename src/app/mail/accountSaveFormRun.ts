import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { readValidatedAccountSaveForm } from "./accountSaveFormRequestRun";
import { persistAccountSaveForm } from "./accountSaveFormPersistRun";

export async function saveAccountFromSettingsForm() {
  if (!isTauriRuntime()) {
    state.accountMessage =
      "L’enregistrement du compte sur disque requiert l’app Tauri (npm run tauri:dev), pas le navigateur seul.";
    render();
    toast(state.accountMessage);
    return;
  }

  const validated = readValidatedAccountSaveForm();
  if (!validated) return;
  await persistAccountSaveForm(validated);
}
