/**
 * Premier lancement : assistant en plusieurs étapes (langue, options rapides, guide).
 * Configuration détaillée → Paramètres.
 */

import { invoke } from "@tauri-apps/api/core";
import type { AppPrefs } from "./prefs_defaults";
import { setLocale, t } from "./i18n";

export type LlamaDetectResult = {
  onPath: boolean;
  wingetInstalled: boolean;
  resolvedPath?: string | null;
};

type WizardOpts = {
  prefs: AppPrefs;
  onDismiss: (prefs: AppPrefs) => void;
  toast: (msg: string) => void;
};

type WizardDraft = {
  lang: "fr" | "en";
  dictation: boolean;
  semanticSearch: boolean;
  localLlm: boolean;
};

const STEP_COUNT = 3;

function overlayShell(step: number, bodyHtml: string, actionsHtml: string): string {
  return `
    <div class="setup-wizard-overlay" id="setup-wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title">
      <div class="setup-wizard surface-sm">
        <p class="setup-wizard__step dim" id="setup-wizard-step-label">${t("onboarding.stepOf", { current: step, total: STEP_COUNT })}</p>
        ${bodyHtml}
        <div class="setup-wizard__actions">${actionsHtml}</div>
      </div>
    </div>`;
}

function stepWelcomeHtml(): string {
  return `
    <h2 id="setup-wizard-title" class="setup-wizard__title">${t("onboarding.welcomeTitle")}</h2>
    <p class="dim setup-wizard__lead">${t("onboarding.welcomeLead")}</p>
    <fieldset class="setup-wizard__fieldset">
      <legend class="setup-wizard__legend">${t("onboarding.languageLabel")}</legend>
      <label class="settings-form-check setup-wizard__radio">
        <input type="radio" name="setup-wizard-lang" value="fr" />
        <span class="settings-form-check-text">${t("onboarding.languageFr")}</span>
      </label>
      <label class="settings-form-check setup-wizard__radio">
        <input type="radio" name="setup-wizard-lang" value="en" />
        <span class="settings-form-check-text">${t("onboarding.languageEn")}</span>
      </label>
    </fieldset>`;
}

function stepFeaturesHtml(): string {
  return `
    <h2 id="setup-wizard-title" class="setup-wizard__title">${t("onboarding.featuresTitle")}</h2>
    <p class="dim setup-wizard__lead">${t("onboarding.featuresLead")}</p>
    <label class="settings-form-check setup-wizard__check">
      <input type="checkbox" id="setup-wizard-dictation" />
      <span class="settings-form-check-text">
        <span class="settings-form-check-title">${t("onboarding.dictationTitle")}</span>
        <span class="dim settings-form-check-sub">${t("onboarding.dictationSub")}</span>
      </span>
    </label>
    <label class="settings-form-check setup-wizard__check">
      <input type="checkbox" id="setup-wizard-semantic" checked />
      <span class="settings-form-check-text">
        <span class="settings-form-check-title">${t("onboarding.semanticTitle")}</span>
        <span class="dim settings-form-check-sub">${t("onboarding.semanticSub")}</span>
      </span>
    </label>
    <label class="settings-form-check setup-wizard__check">
      <input type="checkbox" id="setup-wizard-local-llm" />
      <span class="settings-form-check-text">
        <span class="settings-form-check-title">${t("onboarding.localLlmTitle")}</span>
        <span class="dim settings-form-check-sub">${t("onboarding.localLlmSub")}</span>
      </span>
    </label>
    <p class="dim setup-wizard__llama-status" id="setup-wizard-llama-status" hidden></p>`;
}

function stepGuideHtml(draft: WizardDraft): string {
  const items: string[] = [t("onboarding.guideAccounts")];
  if (draft.dictation || draft.semanticSearch) {
    items.push(t("onboarding.guideModels"));
  }
  if (draft.dictation) {
    items.push(t("onboarding.guideDictation"));
  }
  if (draft.localLlm) {
    items.push(t("onboarding.guideLocalLlm"));
  }
  items.push(t("onboarding.guideSettings"));
  const list = items.map((line) => `<li>${line}</li>`).join("");
  return `
    <h2 id="setup-wizard-title" class="setup-wizard__title">${t("onboarding.guideTitle")}</h2>
    <p class="dim setup-wizard__lead">${t("onboarding.guideLead")}</p>
    <ul class="setup-wizard__guide-list">${list}</ul>`;
}

function readLang(overlay: HTMLElement): "fr" | "en" {
  const checked = overlay.querySelector<HTMLInputElement>('input[name="setup-wizard-lang"]:checked');
  return checked?.value === "en" ? "en" : "fr";
}

function readDraft(overlay: HTMLElement, base: WizardDraft): WizardDraft {
  return {
    lang: readLang(overlay),
    dictation: overlay.querySelector<HTMLInputElement>("#setup-wizard-dictation")?.checked ?? base.dictation,
    semanticSearch: overlay.querySelector<HTMLInputElement>("#setup-wizard-semantic")?.checked ?? base.semanticSearch,
    localLlm: overlay.querySelector<HTMLInputElement>("#setup-wizard-local-llm")?.checked ?? base.localLlm,
  };
}

function applyDraftToPrefs(prefs: AppPrefs, draft: WizardDraft): void {
  prefs.general.motherLanguage = draft.lang;
  prefs.ai.dictationEnabled = draft.dictation;
  if (draft.dictation) {
    prefs.ai.dictationBackend = "whisper_cpp";
    prefs.ai.speechLanguage = draft.lang;
    prefs.ai.whisperCppLanguage = draft.lang === "fr" ? "fr" : "en";
    prefs.ai.draftLanguage = draft.lang;
  }
  prefs.ai.semanticSearchEnabled = draft.semanticSearch;
  if (draft.localLlm) {
    prefs.ai.localLlmEnabled = true;
    if (!prefs.ai.llamaServerBinaryPath?.trim()) {
      prefs.ai.llamaServerBinaryPath = "llama-server";
    }
  } else {
    prefs.ai.localLlmEnabled = false;
  }
}

function bindLlamaHelpers(overlay: HTMLElement, prefs: AppPrefs, toast: WizardOpts["toast"]): void {
  const check = overlay.querySelector<HTMLInputElement>("#setup-wizard-local-llm");
  const statusEl = overlay.querySelector<HTMLParagraphElement>("#setup-wizard-llama-status");
  const wingetBtn = overlay.querySelector<HTMLButtonElement>("#setup-wizard-winget");
  if (!check || !statusEl) return;

  const refreshLlamaStatus = async () => {
    if (!check.checked) {
      statusEl.hidden = true;
      if (wingetBtn) wingetBtn.hidden = true;
      return;
    }
    statusEl.hidden = false;
    try {
      const det = await invoke<LlamaDetectResult>("llama_server_detect", {
        binaryHint: prefs.ai.llamaServerBinaryPath || "llama-server",
      });
      if (det.onPath || det.wingetInstalled) {
        statusEl.textContent = t("onboarding.llamaDetected");
        if (wingetBtn) wingetBtn.hidden = true;
      } else {
        statusEl.textContent = t("onboarding.llamaMissing");
        if (wingetBtn) wingetBtn.hidden = false;
      }
    } catch (e) {
      statusEl.textContent = t("onboarding.llamaDetectError", { error: String(e) });
    }
  };

  check.addEventListener("change", () => {
    void refreshLlamaStatus();
  });

  wingetBtn?.addEventListener("click", async () => {
    wingetBtn.disabled = true;
    try {
      const res = await invoke<{ success: boolean; message: string }>("llama_server_winget_install", {});
      toast(res.message);
      if (res.success) {
        prefs.ai.llamaServerEnabled = true;
        prefs.ai.llamaServerSpawnEnabled = true;
        prefs.ai.llamaServerBinaryPath = "llama-server";
        prefs.ai.localLlmEnabled = true;
      }
      await refreshLlamaStatus();
    } catch (e) {
      toast(String(e));
    } finally {
      wingetBtn.disabled = false;
    }
  });
}

function mountStep(
  opts: WizardOpts,
  step: number,
  draft: WizardDraft,
  onDraftChange: (d: WizardDraft) => void,
): void {
  const existing = document.getElementById("setup-wizard-overlay");
  existing?.remove();

  let bodyHtml = "";
  let actionsHtml = "";

  if (step === 1) {
    bodyHtml = stepWelcomeHtml();
    actionsHtml = `
      <button type="button" class="ghost-button" id="setup-wizard-skip">${t("onboarding.skipAll")}</button>
      <button type="button" class="primary-button" id="setup-wizard-next">${t("onboarding.next")}</button>`;
  } else if (step === 2) {
    bodyHtml = stepFeaturesHtml();
    actionsHtml = `
      <button type="button" class="ghost-button" id="setup-wizard-back">${t("common.back")}</button>
      <button type="button" class="ghost-button" id="setup-wizard-winget" hidden>${t("onboarding.wingetInstall")}</button>
      <button type="button" class="primary-button" id="setup-wizard-next">${t("onboarding.next")}</button>`;
  } else {
    bodyHtml = stepGuideHtml(draft);
    actionsHtml = `
      <button type="button" class="ghost-button" id="setup-wizard-back">${t("common.back")}</button>
      <button type="button" class="primary-button" id="setup-wizard-finish">${t("onboarding.finish")}</button>`;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = overlayShell(step, bodyHtml, actionsHtml);
  const overlay = wrap.firstElementChild as HTMLElement;
  document.body.appendChild(overlay);

  const initialLang = draft.lang === "en" ? "en" : "fr";
  const langInput = overlay.querySelector<HTMLInputElement>(`input[name="setup-wizard-lang"][value="${initialLang}"]`);
  if (langInput) langInput.checked = true;

  if (step === 2) {
    const dict = overlay.querySelector<HTMLInputElement>("#setup-wizard-dictation");
    const sem = overlay.querySelector<HTMLInputElement>("#setup-wizard-semantic");
    const llm = overlay.querySelector<HTMLInputElement>("#setup-wizard-local-llm");
    if (dict) dict.checked = draft.dictation;
    if (sem) sem.checked = draft.semanticSearch;
    if (llm) llm.checked = draft.localLlm;
    bindLlamaHelpers(overlay, opts.prefs, opts.toast);
  }

  overlay.querySelectorAll('input[name="setup-wizard-lang"]').forEach((el) => {
    el.addEventListener("change", () => {
      const lang = readLang(overlay);
      const next = { ...draft, lang };
      setLocale(lang);
      onDraftChange(next);
      mountStep(opts, step, next, onDraftChange);
    });
  });

  const finish = (prefs: AppPrefs) => {
    prefs.general.firstRunDismissed = true;
    overlay.remove();
    opts.onDismiss(prefs);
  };

  overlay.querySelector("#setup-wizard-skip")?.addEventListener("click", () => {
    finish(opts.prefs);
  });

  overlay.querySelector("#setup-wizard-back")?.addEventListener("click", () => {
    const d = step === 2 ? readDraft(overlay, draft) : draft;
    onDraftChange(d);
    mountStep(opts, step - 1, d, onDraftChange);
  });

  overlay.querySelector("#setup-wizard-next")?.addEventListener("click", () => {
    const d = step === 1 ? { ...draft, lang: readLang(overlay) } : readDraft(overlay, draft);
    setLocale(d.lang);
    onDraftChange(d);
    mountStep(opts, step + 1, d, onDraftChange);
  });

  overlay.querySelector("#setup-wizard-finish")?.addEventListener("click", () => {
    applyDraftToPrefs(opts.prefs, draft);
    setLocale(draft.lang);
    finish(opts.prefs);
  });
}

export function maybeShowFirstRunWizard(opts: WizardOpts): void {
  if (opts.prefs.general.firstRunDismissed) return;

  const mother = (opts.prefs.general.motherLanguage ?? "fr").trim().toLowerCase();
  const draft: WizardDraft = {
    lang: mother.startsWith("en") ? "en" : "fr",
    dictation: opts.prefs.ai.dictationEnabled,
    semanticSearch: opts.prefs.ai.semanticSearchEnabled !== false,
    localLlm: opts.prefs.ai.localLlmEnabled,
  };

  let current = draft;
  const updateDraft = (d: WizardDraft) => {
    current = d;
  };
  mountStep(opts, 1, current, updateDraft);
}
