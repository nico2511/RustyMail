/**
 * Extrait des fonctions (ou blocs let) de app/application.ts vers un module,
 * ajoute les exports/imports, retire le corps du fichier source.
 *
 * Usage: node tools/extract-application-fns.mjs <target.ts> fn1 fn2 ...
 */
import fs from "node:fs";
import ts from "typescript";

const APP = "src/app/application.ts";
const target = process.argv[2];
const names = new Set(process.argv.slice(3));
if (!target || names.size === 0) {
  console.error("Usage: node tools/extract-application-fns.mjs <target.ts> fn1 fn2 ...");
  process.exit(1);
}

const src = fs.readFileSync(APP, "utf8");
const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const extracted = [];
const keep = [];

for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name && names.has(st.name.text)) {
    let text = st.getText(sf);
    if (!text.startsWith("export ")) {
      text = text.replace(/^async function /, "export async function ").replace(/^function /, "export function ");
    }
    extracted.push(text);
    continue;
  }
  if (ts.isVariableStatement(st)) {
    const text = st.getText(sf);
    const isModalState =
      names.has("__modal_state__") &&
      (text.includes("textPromptModal") || text.includes("confirmModal") || text.includes("textPromptResolver"));
    if (isModalState) {
      extracted.push(text.replace(/^let /, "let ").replace(/^const /, "export const "));
      continue;
    }
  }
  keep.push(st.getText(sf));
}

if (extracted.length === 0) {
  console.error("Nothing extracted for", [...names].join(", "));
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
  const appSrc = fs.readFileSync(APP, "utf8");
  const exportList = importNames.join(", ");
  const importLine = `import { ${exportList} } from "${importPath}";\n`;
  if (!appSrc.includes(importLine.trim())) {
    const idx = appSrc.indexOf('import "../styles.css"');
    const insertAt = idx >= 0 ? idx : appSrc.indexOf("\n", appSrc.lastIndexOf("from "../mailboxTree\"")) + 1;
    fs.writeFileSync(APP, appSrc.slice(0, insertAt) + importLine + appSrc.slice(insertAt));
  }
}

console.log(`Extracted ${extracted.length} block(s) -> ${rel}`);
