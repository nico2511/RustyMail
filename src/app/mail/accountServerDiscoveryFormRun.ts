import { invoke } from "@tauri-apps/api/core";
import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverSidesFromDiscovery,
  serverSidesFromPreset,
  type DiscoverMailServersResult,
} from "../../accountSetup";
import { setDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { ACCOUNT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { inputValue } from "../lib/domForm";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";

export async function discoverMailServersAction(): Promise<void> {
  const emailRaw = inputValue("account-email").trim();
  if (!emailRaw.includes("@")) {
    toast("Saisissez une adresse e-mail complète avant la détection.");
    return;
  }
  if (accountFieldTouched.serverFields) {
    const ok = await openConfirmModal({
      title: "Remplacer les serveurs ?",
      body: "Les serveurs ont été modifiés à la main. Les remplacer par le résultat de la détection ?",
      confirmLabel: "Remplacer",
    });
    if (!ok) return;
    accountFieldTouched.serverFields = false;
  }

  if (!isTauriRuntime()) {
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(p));
        state.accountMessage = `Préréglage local (${domain}) — lancez RustyMail en mode bureau pour ISPDB, .well-known et autoconfig.`;
        accountFieldTouched.serverFields = false;
        state.accountServersPanelOpen = true;
        render();
      },
    });
    if (!preset) {
      toast(
        "Aucun préréglage local pour ce domaine · lancement en application bureau nécessaire pour la détection automatique étendue.",
      );
    }
    return;
  }

  try {
    toast("Détection des serveurs (ISPDB Mozilla, .well-known, autoconfig, préréglages locaux…)…");
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email: emailRaw }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    setDiscoveredServersFormSnap(serverSidesFromDiscovery(raw));
    accountFieldTouched.serverFields = false;
    state.accountMessage = raw.sourceLabel;
    state.accountServersPanelOpen = true;
    render();
  } catch (err) {
    const text = tauriErrorMessage(err);
    toast(text);
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(p));
        state.accountMessage = `Préréglage local (${domain}) après échec : ${text}`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
    if (!preset) {
      state.accountMessage = text;
      render();
    }
  }
}
