import type { AppPrefsAi } from "../../prefs_defaults";
import { engineConnectionMode } from "../../settingsAiPanel";

export type StatusBarModelChip = {
  label: string;
  title: string;
  /** `true` = popover Ollama ; sinon ouverture Paramètres → IA. */
  ollamaSwitch: boolean;
};

function truncateModel(name: string, max = 22): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Libellé discret du modèle actif pour la barre de statut. */
export function statusBarActiveModelChip(ai: AppPrefsAi): StatusBarModelChip {
  const mode = engineConnectionMode(ai);
  if (mode === "off") {
    return {
      label: "IA off",
      title: "IA désactivée — Paramètres → IA",
      ollamaSwitch: false,
    };
  }
  if (mode === "ollama") {
    const m = ai.ollamaModel.trim();
    return {
      label: m ? truncateModel(m) : "Modèle ?",
      title: m ? `Ollama · ${m} — changer de modèle` : "Ollama — choisir un modèle",
      ollamaSwitch: true,
    };
  }
  if (mode === "cloud") {
    const m = ai.openrouterModel.trim();
    return {
      label: m ? truncateModel(m) : "OpenRouter",
      title: m ? `OpenRouter · ${m} — Paramètres → IA` : "OpenRouter — Paramètres → IA",
      ollamaSwitch: false,
    };
  }
  if (mode === "local") {
    const m = ai.llamaServerModel.trim();
    return {
      label: m ? truncateModel(m) : "llama-server",
      title: m ? `llama-server · ${m} — Paramètres → IA` : "llama-server — Paramètres → IA",
      ollamaSwitch: false,
    };
  }
  // hybrid / auto : priorité OpenRouter → llama-server → Ollama (comme build_llm_engine)
  if (ai.openrouterEnabled && ai.openrouterModel.trim()) {
    const m = ai.openrouterModel.trim();
    return {
      label: truncateModel(m),
      title: `OpenRouter · ${m} — Paramètres → IA`,
      ollamaSwitch: false,
    };
  }
  if (ai.llamaServerEnabled && ai.llamaServerModel.trim()) {
    const m = ai.llamaServerModel.trim();
    return {
      label: truncateModel(m),
      title: `llama-server · ${m} — Paramètres → IA`,
      ollamaSwitch: false,
    };
  }
  if (ai.ollamaEnabled) {
    const m = ai.ollamaModel.trim();
    return {
      label: m ? truncateModel(m) : "Modèle ?",
      title: m ? `Ollama · ${m} — changer de modèle` : "Ollama — choisir un modèle",
      ollamaSwitch: true,
    };
  }
  return {
    label: "IA",
    title: "Paramètres → IA",
    ollamaSwitch: false,
  };
}
