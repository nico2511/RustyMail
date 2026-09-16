import fs from "node:fs";
import ts from "typescript";

const APP = "src/app/application.ts";

function extractFunctions(names, outFile, extraHeader = "") {
  const src = fs.readFileSync(APP, "utf8");
  const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.Latest, true);
  const nameSet = new Set(names);
  const chunks = [];
  const keep = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && nameSet.has(st.name.text)) {
      let text = st.getText(sf);
      text = text.replace(/^function /, "export function ");
      chunks.push(text);
      continue;
    }
    keep.push(st.getText(sf));
  }
  fs.mkdirSync(outFile.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(outFile, extraHeader + chunks.join("\n\n") + "\n");
  fs.writeFileSync(APP, keep.join("\n\n") + "\n");
  const rel = outFile.replace(/^src\/app\//, "./").replace(/^src\//, "./").replace(/\.ts$/, "");
  const importLine = `import { ${names.join(", ")} } from "${rel}";\n`;
  let app = fs.readFileSync(APP, "utf8");
  if (!app.includes(importLine.trim())) {
    app = app.replace('import "../styles.css";', importLine + 'import "../styles.css";');
    fs.writeFileSync(APP, app);
  }
  console.log(outFile, chunks.length);
}

extractFunctions(
  ["utf8StringToBase64", "base64ToUtf8String", "mailHtmlMountAttrs", "flattenNestedParagraphInDocument", "base64ToImageBlob"],
  "src/app/lib/htmlMessage.ts",
  `import { escapeAttr } from "../../ui/sanitize";\n\n`,
);

extractFunctions(
  ["composeRewriteStyleFromTone"],
  "src/app/core/composeTone.ts",
  `import { state } from "../state";\nimport type { Tone } from "../types";\n\nexport const tones: Tone[] = ["Professional", "Casual", "Assertive", "Empathetic"];\n\nexport const toneLabelsFr: Record<Tone, string> = {\n  Professional: "Professionnel",\n  Casual: "Décontracté",\n  Assertive: "Ferme",\n  Empathetic: "Empathique",\n};\n\n`,
);
