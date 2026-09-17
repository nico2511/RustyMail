import type { AppCapabilities, AppStatus } from "../types";

export function fallbackStatus(): AppStatus {
  return {
    appName: "RustyMail",
    version: "0.1.1",
    walEnabled: true,
    vaultKeyLocation: "OS Keyring",
    aiRuntime: "ONNX + whisper.cpp",
  };
}

export function fallbackCapabilities(): AppCapabilities {
  return {
    mailCore: true,
    readabilityModules: true,
    aiModules: true,
    dictation: false,
    storage: "browser fallback",
  };
}

export function normalizeCapabilities(raw: unknown): AppCapabilities {
  const fb = fallbackCapabilities();
  if (!raw || typeof raw !== "object") return fb;
  const r = raw as Record<string, unknown>;
  const pickBool = (camel: keyof AppCapabilities, snake: string, fallback: boolean): boolean => {
    const v = r[camel] ?? r[snake];
    return typeof v === "boolean" ? v : fallback;
  };
  const storageRaw = r.storage;
  return {
    mailCore: pickBool("mailCore", "mail_core", fb.mailCore),
    readabilityModules: pickBool("readabilityModules", "readability_modules", fb.readabilityModules),
    aiModules: pickBool("aiModules", "ai_modules", fb.aiModules),
    dictation: pickBool("dictation", "dictation", fb.dictation),
    storage: typeof storageRaw === "string" && storageRaw.trim() ? storageRaw : fb.storage,
  };
}
