import fs from "node:fs";

/** Default TS file for degrade/extract tooling after the application.ts slim-down. */
export const DEFAULT_EXTRACT_SOURCE = "src/app/mail/appModuleRegistry.ts";

export const LEGACY_APPLICATION = "src/app/application.ts";

export function resolveExtractSource(argv = process.argv) {
  const fromEnv = process.env.RUSTYMAIL_EXTRACT_SOURCE?.trim();
  if (fromEnv) return fromEnv;
  const flag = argv.find((a) => a.startsWith("--source="));
  if (flag) return flag.slice("--source=".length);
  return DEFAULT_EXTRACT_SOURCE;
}

export function readExtractSource(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`Extract source not found: ${path}`);
  }
  const src = fs.readFileSync(path, "utf8");
  if (path.endsWith("application.ts") && src.split("\n").length < 20) {
    console.warn(
      `[extract] ${path} is a legacy shim — pass --source=src/app/mail/<module>.ts or set RUSTYMAIL_EXTRACT_SOURCE`,
    );
  }
  return src;
}

/** Insert a new import after the first contiguous import block. */
export function insertImportAfterImports(appSrc, importLine) {
  const trimmed = importLine.trim();
  if (appSrc.includes(trimmed)) return appSrc;
  const lines = appSrc.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("import ") || line.startsWith("import{")) {
      lastImportIdx = i;
      continue;
    }
    if (lastImportIdx >= 0 && line.trim() === "") continue;
    if (lastImportIdx >= 0) break;
  }
  if (lastImportIdx < 0) return `${trimmed}\n${appSrc}`;
  lines.splice(lastImportIdx + 1, 0, trimmed);
  return lines.join("\n");
}
