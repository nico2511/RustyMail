import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";

export type DesktopUpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate"; version: string }
  | { kind: "available"; version: string; notes: string }
  | { kind: "downloading"; version: string; label: string }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string }
  | { kind: "browser" };

type PendingUpdate = {
  version: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
    options?: { restartAfterInstall?: boolean },
  ) => Promise<void>;
  close: () => Promise<void>;
};

let phase: DesktopUpdatePhase = { kind: "idle" };
let pending: PendingUpdate | null = null;
let busy = false;
let startupChecked = false;

export function desktopUpdatePhase(): DesktopUpdatePhase {
  return phase;
}

export function formatUpdateProgress(received: number, total: number | null): string {
  if (total && total > 0) {
    const pct = Math.min(100, Math.round((received / total) * 100));
    return `Téléchargement… ${pct} %`;
  }
  const kb = Math.max(0, Math.round(received / 1024));
  return kb > 0 ? `Téléchargement… ${kb} Ko` : "Téléchargement…";
}

export function frenchUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const low = raw.toLowerCase();
  if (
    low.includes("public key") ||
    low.includes("pubkey") ||
    low.includes("minisign") ||
    low.includes("remplacer_par_la_cle")
  ) {
    return "Vérification impossible : la clé publique de l’updater n’est pas encore configurée. Voir docs/RELEASE.md.";
  }
  if (low.includes("signature")) {
    return "Signature de mise à jour refusée. L’installeur n’a pas été appliqué.";
  }
  if (
    low.includes("network") ||
    low.includes("fetch") ||
    low.includes("timed out") ||
    low.includes("dns") ||
    low.includes("connect")
  ) {
    return "Impossible de joindre GitHub Releases. Réessayez plus tard.";
  }
  return raw.trim() || "Vérification des mises à jour impossible.";
}

function publish(next: DesktopUpdatePhase, opts?: { toast?: string }): void {
  phase = next;
  if (opts?.toast) {
    if (next.kind === "error") toast.error(opts.toast);
    else if (next.kind === "uptodate" || next.kind === "ready") toast.success(opts.toast);
    else toast.info(opts.toast);
  }
  const chromeKinds = next.kind === "available" || next.kind === "ready";
  if (chromeKinds || (state.view === "settings" && state.settingsTab === "general")) render();
}

async function replacePending(next: PendingUpdate | null): Promise<void> {
  if (pending && pending !== next) {
    try {
      await pending.close();
    } catch {
      /* ressource déjà relâchée */
    }
  }
  pending = next;
}

export async function checkForDesktopUpdate(opts?: { quiet?: boolean }): Promise<void> {
  if (!isTauriRuntime()) {
    publish({ kind: "browser" });
    return;
  }
  if (busy) return;
  busy = true;
  if (!opts?.quiet) publish({ kind: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      await replacePending(null);
      publish(
        { kind: "uptodate", version: "" },
        opts?.quiet ? undefined : { toast: "RustyMail est à jour." },
      );
      return;
    }
    await replacePending(update);
    const notes = (update.body ?? "").trim();
    publish({ kind: "available", version: update.version, notes });
    if (opts?.quiet) {
      toast.info(`Mise à jour ${update.version} disponible. Paramètres → Général pour l’installer.`, {
        action: {
          label: "Ouvrir",
          onClick: () => {
            state.view = "settings";
            state.settingsTab = "general";
            render();
          },
        },
      });
    }
  } catch (error) {
    await replacePending(null);
    if (!opts?.quiet) publish({ kind: "error", message: frenchUpdateError(error) });
  } finally {
    busy = false;
  }
}

export async function installDesktopUpdate(): Promise<void> {
  if (!isTauriRuntime() || busy) return;
  if (!pending) {
    await checkForDesktopUpdate();
    if (!pending || phase.kind !== "available") return;
  }
  const update = pending;
  busy = true;
  let received = 0;
  let total: number | null = null;
  publish({ kind: "downloading", version: update.version, label: "Téléchargement…" });
  try {
    await update.downloadAndInstall(
      (event) => {
        if (event.event === "Started") {
          total = event.data?.contentLength ?? null;
        } else if (event.event === "Progress") {
          received += event.data?.chunkLength ?? 0;
        }
        publish({
          kind: "downloading",
          version: update.version,
          label: formatUpdateProgress(received, total),
        });
      },
      { restartAfterInstall: true },
    );
    pending = null;
    publish({
      kind: "ready",
      version: update.version,
    });
  } catch (error) {
    publish({ kind: "error", message: frenchUpdateError(error) });
  } finally {
    busy = false;
  }
}

export async function relaunchDesktopApp(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** Au démarrage : signaler une mise à jour, sans télécharger. */
export function quietStartupUpdateCheck(): void {
  if (!isTauriRuntime() || startupChecked) return;
  startupChecked = true;
  void checkForDesktopUpdate({ quiet: true });
}
