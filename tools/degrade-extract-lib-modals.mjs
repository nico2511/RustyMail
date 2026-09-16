import fs from "node:fs";
import ts from "typescript";

const APP = "src/app/application.ts";
const src = fs.readFileSync(APP, "utf8");
const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.Latest, true);

const importEnd = sf.statements.findIndex((st) => !ts.isImportDeclaration(st) && !ts.isImportEqualsDeclaration(st));

const fnNames = new Set([
  "toast",
  "inputValue",
  "numberValue",
  "selectValue",
  "checkedValue",
  "formatTime",
  "trimUrlTrailingPunct",
  "linkifyPlainSegment",
  "formatPlainTextWithLinks",
  "initials",
  "formatTag",
  "isNoisyTag",
  "iconSvg",
  "openTextPromptModal",
  "finishTextPromptModal",
  "renderTextPromptModal",
  "openConfirmModal",
  "finishConfirmModal",
  "renderConfirmModal",
]);

const modalVarDecl = (text) =>
  /^(let textPromptModal|let textPromptResolver|let confirmModal|let confirmResolver)/m.test(text.trim());
const toastConst = (text) => text.includes("DEFAULT_TOAST_DURATION_MS") || text.includes("MAX_TOAST_STACK");

const buckets = {
  toast: [],
  domForm: [],
  textFormat: [],
  tags: [],
  iconSvg: [],
  modals: [],
};
const keep = [];

for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name && fnNames.has(st.name.text)) {
    let text = st.getText(sf);
    text = text.replace(/^async function /, "export async function ").replace(/^function /, "export function ");
    const n = st.name.text;
    if (n === "iconSvg") buckets.iconSvg.push(text);
    else if (n.includes("Modal") || n.startsWith("open") || n.startsWith("finish") || n.startsWith("renderText") || n.startsWith("renderConfirm"))
      buckets.modals.push(text);
    else if (n === "toast") buckets.toast.push(text);
    else if (["inputValue", "numberValue", "selectValue", "checkedValue", "formatTime"].includes(n)) buckets.domForm.push(text);
    else if (["trimUrlTrailingPunct", "linkifyPlainSegment", "formatPlainTextWithLinks"].includes(n)) buckets.textFormat.push(text);
    else buckets.tags.push(text);
    continue;
  }
  if (ts.isVariableStatement(st)) {
    const text = st.getText(sf);
    if (modalVarDecl(text)) {
      buckets.modals.unshift(text);
      continue;
    }
    if (toastConst(text)) {
      buckets.toast.unshift(text);
      continue;
    }
  }
  keep.push(st.getText(sf));
}

fs.mkdirSync("src/app/lib", { recursive: true });
fs.mkdirSync("src/app/modals", { recursive: true });

const sanitizeImport = `import { escapeAttr, escapeHtml } from "../../ui/sanitize";\n`;
const tagImport = `${sanitizeImport}import type { Tag } from "../types";\n\n`;

fs.writeFileSync("src/app/lib/toast.ts", buckets.toast.join("\n\n") + "\n");
fs.writeFileSync("src/app/lib/domForm.ts", buckets.domForm.join("\n\n") + "\n");
fs.writeFileSync("src/app/lib/textFormat.ts", sanitizeImport + buckets.textFormat.join("\n\n") + "\n");
fs.writeFileSync("src/app/lib/tags.ts", tagImport + buckets.tags.join("\n\n") + "\n");
fs.writeFileSync("src/app/lib/iconSvg.ts", buckets.iconSvg.join("\n\n") + "\n");

const modalFile = `${sanitizeImport}import { render } from "../dispatch";
import { iconSvg } from "../lib/iconSvg";
import type { ConfirmModalSpec, TextPromptModalSpec } from "../types";

${buckets.modals.join("\n\n")}

export function isTextPromptOpen(): boolean {
  return textPromptModal !== null;
}

export function isConfirmOpen(): boolean {
  return confirmModal !== null;
}
`;
fs.writeFileSync("src/app/modals/promptConfirm.ts", modalFile);

let app = keep.join("\n\n") + "\n";
const newImports = `
import { toast } from "./lib/toast";
import { inputValue, numberValue, selectValue, checkedValue, formatTime } from "./lib/domForm";
import { formatPlainTextWithLinks, linkifyPlainSegment, trimUrlTrailingPunct } from "./lib/textFormat";
import { initials, formatTag, isNoisyTag } from "./lib/tags";
import { iconSvg } from "./lib/iconSvg";
import {
  openTextPromptModal,
  finishTextPromptModal,
  renderTextPromptModal,
  openConfirmModal,
  finishConfirmModal,
  renderConfirmModal,
  isTextPromptOpen,
  isConfirmOpen,
} from "./modals/promptConfirm";
`;

app = app.replace('import "../styles.css";', newImports + 'import "../styles.css";');

app = app.replace(/if \(textPromptModal\)/g, "if (isTextPromptOpen())");
app = app.replace(/if \(state\.searchModalOpen && !textPromptModal\)/g, "if (state.searchModalOpen && !isTextPromptOpen())");
app = app.replace(
  /textPromptModal \|\|\s*\n\s*confirmModal/g,
  "isTextPromptOpen() || isConfirmOpen()",
);

fs.writeFileSync(APP, app);
console.log("Removed from application.ts:", [...fnNames].join(", "));
console.log("New application lines:", app.split("\n").length);
