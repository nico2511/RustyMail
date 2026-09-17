import fs from "node:fs";
import ts from "typescript";
import { readExtractSource, resolveExtractSource } from "./extract-source.mjs";

const APP = resolveExtractSource();
const OUT = "src/app/ui/render/views.ts";
const src = readExtractSource(APP);
const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.Latest, true);

const importEnd = sf.statements.findIndex((st) => !ts.isImportDeclaration(st) && !ts.isImportEqualsDeclaration(st));
const appImports = sf.statements.slice(0, importEnd).map((s) => s.getText(sf)).join("\n");

const isRenderFn = (name) => name === "render" || name.startsWith("render");

const renderChunks = [];
const keep = [];

for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name && isRenderFn(st.name.text)) {
    let text = st.getText(sf);
    text = text.replace(/^function /, "export function ");
    renderChunks.push(text);
    continue;
  }
  keep.push(st.getText(sf));
}

if (renderChunks.length === 0) {
  console.log(`No render* functions in ${APP}; extraction already applied or use --source=`);
  process.exit(0);
}

const header = appImports
  .replace(/from "\.\.\//g, 'from "../../../')
  .replace(/from "\.\//g, 'from "../../')
  + `
import { state } from "../../state";
import { root as appShell } from "../../dom";
import { registerRender } from "../../dispatch";
import { toast } from "../../lib/toast";
import { iconSvg } from "../../lib/iconSvg";
import { initials, formatTag, isNoisyTag } from "../../lib/tags";
import { formatPlainTextWithLinks } from "../../lib/textFormat";
import {
  renderTextPromptModal,
  renderConfirmModal,
  isTextPromptOpen,
  isConfirmOpen,
} from "../../modals/promptConfirm";
`;

const footer = `
registerRender(render);
`;

fs.mkdirSync("src/app/ui/render", { recursive: true });
fs.writeFileSync(OUT, header + "\n" + renderChunks.join("\n\n") + footer);

let app = keep.join("\n\n") + "\n";
app = app.replace(/\nregisterRender\(render\);\n?$/, "\n");
app = app.replace('import { registerRender } from "./dispatch";', 'import { registerRender } from "./dispatch";\nimport "./ui/render/views";');

if (!app.includes('./ui/render/views')) {
  app = app.replace('import "../styles.css";', 'import "./ui/render/views";\nimport "../styles.css";');
}

fs.writeFileSync(APP, app);
console.log("Extracted", renderChunks.length, "render functions ->", OUT);
console.log(`${APP} lines:`, app.split("\n").length);
