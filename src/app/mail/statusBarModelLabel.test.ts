import { describe, expect, it } from "vitest";
import { defaultAppPrefs } from "../../prefs_defaults";
import { statusBarActiveModelChip } from "./statusBarModelLabel";

describe("statusBarActiveModelChip", () => {
  it("affiche IA off quand aucun moteur n’est actif", () => {
    const ai = defaultAppPrefs().ai;
    const chip = statusBarActiveModelChip(ai);
    expect(chip.label).toBe("IA off");
    expect(chip.ollamaSwitch).toBe(false);
  });

  it("propose le switch Ollama avec le modèle courant", () => {
    const ai = defaultAppPrefs().ai;
    ai.chatBackend = "ollama";
    ai.ollamaEnabled = true;
    ai.ollamaModel = "qwen2.5:7b";
    const chip = statusBarActiveModelChip(ai);
    expect(chip.label).toBe("qwen2.5:7b");
    expect(chip.ollamaSwitch).toBe(true);
    expect(chip.title).toContain("Ollama");
  });

  it("tronque les noms longs et ouvre les réglages pour OpenRouter", () => {
    const ai = defaultAppPrefs().ai;
    ai.chatBackend = "openrouter";
    ai.openrouterEnabled = true;
    ai.openrouterModel = "anthropic/claude-3.5-sonnet-very-long-name";
    const chip = statusBarActiveModelChip(ai);
    expect(chip.label.endsWith("…")).toBe(true);
    expect(chip.label.length).toBeLessThanOrEqual(22);
    expect(chip.ollamaSwitch).toBe(false);
  });
});
