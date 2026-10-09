import { describe, expect, it } from "vitest";
import { defaultAppPrefs, type AppPrefsAi } from "./prefs_defaults";
import {
  applyEngineConnectionMode,
  engineConnectionMode,
  llmConnectionStatus,
  renderSettingsAiHub,
  type SettingsAiPanelDeps,
} from "./settingsAiPanel";

function ai(patch: Partial<AppPrefsAi> = {}): AppPrefsAi {
  return { ...defaultAppPrefs().ai, ...patch };
}

function deps(patch: Partial<AppPrefsAi> = {}, extra: Partial<SettingsAiPanelDeps> = {}): SettingsAiPanelDeps {
  return {
    ai: ai(patch),
    escapeHtml: (s) => s,
    escapeAttr: (s) => s,
    iconSvg: () => "",
    settingsExplainHtml: (inner) => inner,
    formatWhisperPttKeyLabel: (code) => code,
    isTauri: true,
    semanticStatsBlock: "",
    semOk: false,
    keyHint: "",
    dictationApiKeySet: false,
    openrouterApiKeySet: false,
    llamaServerApiKeySet: false,
    llmRuntimeStatus: null,
    llmPrefetchPercent: null,
    llmPrefetchInFlight: false,
    llmCachedGgufFilenames: [],
    bootstrapModelsCompleted: false,
    engineSettingsTab: "off",
    ...extra,
  };
}

function modeFields(html: string): string {
  const start = html.indexOf('class="settings-ai-mode-fields"');
  const end = html.indexOf('class="settings-ai-fold"');
  return html.slice(start, end === -1 ? undefined : end);
}

describe("engineConnectionMode", () => {
  it("traite une config vide comme désactivée", () => {
    expect(engineConnectionMode(ai())).toBe("off");
  });

  it("reconnaît chaque moteur explicite", () => {
    expect(engineConnectionMode(ai({ chatBackend: "ollama", ollamaEnabled: true }))).toBe("ollama");
    expect(engineConnectionMode(ai({ chatBackend: "openrouter", openrouterEnabled: true }))).toBe("cloud");
    expect(engineConnectionMode(ai({ chatBackend: "llama-server", llamaServerEnabled: true }))).toBe("local");
    expect(
      engineConnectionMode(
        ai({ chatBackend: "auto", openrouterEnabled: true, llamaServerEnabled: true, aiCloudLlmFallback: true }),
      ),
    ).toBe("hybrid");
  });

  it("désactive les autres moteurs quand on choisit un mode", () => {
    const prefs = ai({ openrouterEnabled: true, llamaServerEnabled: true, ollamaEnabled: true, chatBackend: "auto" });
    applyEngineConnectionMode(prefs, "ollama");
    expect(prefs.chatBackend).toBe("ollama");
    expect(prefs.ollamaEnabled).toBe(true);
    expect(prefs.openrouterEnabled).toBe(false);
    expect(prefs.llamaServerEnabled).toBe(false);
    applyEngineConnectionMode(prefs, "off");
    expect(prefs.chatBackend).toBe("auto");
    expect(prefs.ollamaEnabled).toBe(false);
  });
});

describe("écran IA", () => {
  it("n’affiche que les champs du mode choisi", () => {
    const ollama = modeFields(renderSettingsAiHub(deps({ chatBackend: "ollama", ollamaEnabled: true })));
    expect(ollama).toContain("prefs-ollama-base-url");
    expect(ollama).toContain("prefs-ollama-model");
    expect(ollama).toContain("prefs-ollama-keep-alive");
    expect(ollama).toContain("Tester la connexion");
    expect(ollama).not.toContain("prefs-openrouter-model");
    expect(ollama).not.toContain("prefs-llama-server-base-url");

    const cloud = modeFields(renderSettingsAiHub(deps({ chatBackend: "openrouter", openrouterEnabled: true })));
    expect(cloud).toContain("prefs-openrouter-model");
    expect(cloud).toContain("prefs-cloud-api-key");
    expect(cloud).not.toContain("prefs-ollama-base-url");
    expect(cloud).not.toContain("prefs-llama-server-base-url");

    const local = modeFields(renderSettingsAiHub(deps({ chatBackend: "llama-server", llamaServerEnabled: true })));
    expect(local).toContain("prefs-llama-server-base-url");
    expect(local).toContain("prefs-llama-server-model");
    expect(local).not.toContain("prefs-ollama-base-url");
    expect(local).not.toContain("prefs-openrouter-model");

    const off = modeFields(renderSettingsAiHub(deps()));
    expect(off).toContain('data-ai-mode="off"');
    expect(off).not.toContain("prefs-ollama-base-url");
    expect(off).not.toContain("prefs-openrouter-model");
    expect(off).not.toContain("prefs-llama-server-base-url");
    expect(off).not.toContain("Tester la connexion");
  });

  it("laisse Organiser disponible, hors du sélecteur de mode", () => {
    const html = renderSettingsAiHub(deps());
    const mode = modeFields(html);
    expect(mode).not.toContain("featureOrgProposalsEnabled");
    expect(html).toContain('data-fold="organiser"');
    expect(html).toContain('data-ai-feature="featureOrgProposalsEnabled"');
    expect(html).toContain("Rien n’est appliqué tout seul.");
  });
});

describe("llmConnectionStatus", () => {
  it("distingue joignable, modèle manquant et erreur pour Ollama", () => {
    const base = deps({ chatBackend: "ollama", ollamaEnabled: true, ollamaModel: "llama3.2" });
    expect(
      llmConnectionStatus("ollama", {
        ...base,
        llmRuntimeStatus: { ollamaReachable: true, ollamaModel: "llama3.2" } as SettingsAiPanelDeps["llmRuntimeStatus"],
      }).tone,
    ).toBe("ok");
    expect(llmConnectionStatus("ollama", { ...base, ai: ai({ ollamaModel: "" }) }).text).toContain("Modèle manquant");
    expect(
      llmConnectionStatus("ollama", {
        ...base,
        llmRuntimeStatus: {
          ollamaReachable: false,
          ollamaStatusMessage: "Ollama injoignable.",
        } as SettingsAiPanelDeps["llmRuntimeStatus"],
      }).tone,
    ).toBe("err");
  });
});
