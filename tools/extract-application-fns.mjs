/**
 * Extrait des fonctions (ou blocs let) d’un module source vers un fichier cible,
 * ajoute les exports/imports, retire le corps du fichier source.
 *
 * Usage:
 *   node tools/extract-application-fns.mjs [--source=src/app/mail/foo.ts] <target.ts> fn1 fn2 ...
 *
 * Source par défaut : app/mail/appModuleRegistry.ts (RUSTYMAIL_EXTRACT_SOURCE pour override).
 */
import fs from "node:fs";
import ts from "typescript";
import {
  insertImportAfterImports,
  readExtractSource,
  resolveExtractSource,
} from "./extract-source.mjs";

const APP = resolveExtractSource();
const cliArgs = process.argv.slice(2).filter((a) => !a.startsWith("--source="));
const target = cliArgs[0];
const names = new Set(cliArgs.slice(1));
if (!target || names.size === 0) {
  console.error(
    "Usage: node tools/extract-application-fns.mjs [--source=path] <target.ts> fn1 fn2 ...",
  );
  process.exit(1);
}

const src = readExtractSource(APP);
const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const extracted = [];
const keep = [];

for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name && names.has(st.name.text)) {
    let text = st.getText(src);
    if (!text.startsWith("export ")) {
      text = text.replace(/^async function /, "export async function ").replace(/^function /, "export function ");
    }
    extracted.push(text);
    continue;
  }
  if (ts.isVariableStatement(st)) {
    const text = st.getText(src);
    const isModalState =
      names.has("__modal_state__") &&
      (text.includes("textPromptModal") || text.includes("confirmModal") || text.includes("textPromptResolver"));
    if (isModalState) {
      extracted.push(text.replace(/^let /, "let ").replace(/^const /, "export const "));
      continue;
    }
  }
  keep.push(st.getText(src));
}

if (extracted.length === 0) {
  console.error(`Nothing extracted from ${APP} for`, [...names].join(", "));
  process.exit(1);
}

const rel = target.startsWith("src/") ? target : `src/${target}`;
fs.mkdirSync(rel.split("/").slice(0, -1).join("/"), { recursive: true });

const existing = fs.existsSync(rel) ? fs.readFileSync(rel, "utf8") + "\n\n" : "";
fs.writeFileSync(rel, existing + extracted.join("\n\n") + "\n");

fs.writeFileSync(APP, keep.join("\n\n") + "\n");

const importPath = rel.replace(/^src\//, "./").replace(/\.ts$/, "");
const importNames = [...names].filter((n) => n !== "__modal_state__");
if (importNames.length) {
  const exportList = importNames.join(", ");
  const importLine = `import { ${exportList} } from "${importPath}";\n`;
  fs.writeFileSync(APP, insertImportAfterImports(fs.readFileSync(APP, "utf8"), importLine));
}

console.log(`Extracted ${extracted.length} block(s) from ${APP} -> ${rel}`);
