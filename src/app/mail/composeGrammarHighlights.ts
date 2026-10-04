import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { state } from "../state";
import { findGrammarSpans } from "./composeGrammarReplace";
import { getComposeBodyEditor, mapComposePlainSpanToDoc } from "./composeBodyEditor";

export const composeGrammarHighlightKey = new PluginKey("composeGrammarHighlights");

const BLOCK_SEPARATOR = "\n\n";
const MAX_MARKS = 80;

function docToPlain(doc: PMNode): string {
  let text = "";
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isBlock && pos > 0) text += BLOCK_SEPARATOR;
    if (node.type.name === "hardBreak") {
      text += "\n";
      return false;
    }
    if (node.isText) text += node.text ?? "";
    return undefined;
  });
  return text;
}

function buildDecorations(doc: PMNode): DecorationSet {
  const suggestions = state.composeGrammarSuggestions;
  if (!suggestions?.length) return DecorationSet.empty;
  const plain = docToPlain(doc);
  const deco: ReturnType<typeof Decoration.inline>[] = [];
  let count = 0;
  for (let i = 0; i < suggestions.length; i++) {
    const g = suggestions[i]!;
    if (!g.original?.trim()) continue;
    for (const span of findGrammarSpans(plain, g)) {
      const mapped = mapComposePlainSpanToDoc(doc, span);
      if (!mapped || mapped.to <= mapped.from) continue;
      const replacement = (g.replacement ?? "").trim();
      const title = replacement ? `Clic pour corriger : ${replacement}` : "Clic pour appliquer la correction";
      deco.push(
        Decoration.inline(mapped.from, mapped.to, {
          class: "compose-grammar-mark",
          "data-grammar-i": String(i),
          "data-plain-start": String(span.start),
          "data-plain-end": String(span.end),
          title,
        }),
      );
      count += 1;
      if (count >= MAX_MARKS) break;
    }
    if (count >= MAX_MARKS) break;
  }
  return DecorationSet.create(doc, deco);
}

/** Force le recalcul des surbrillances (liste de suggestions changée sans docChanged). */
export function refreshComposeGrammarHighlights(): void {
  const ed = getComposeBodyEditor();
  if (!ed || ed.isDestroyed) return;
  ed.view.dispatch(ed.state.tr.setMeta(composeGrammarHighlightKey, true));
}

export const ComposeGrammarHighlights = Extension.create({
  name: "composeGrammarHighlights",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: composeGrammarHighlightKey,
        state: {
          init: (_config, editorState) => buildDecorations(editorState.doc),
          apply: (tr, old) => {
            if (tr.docChanged || tr.getMeta(composeGrammarHighlightKey)) {
              return buildDecorations(tr.doc);
            }
            return old;
          },
        },
        props: {
          decorations(editorState) {
            return composeGrammarHighlightKey.getState(editorState);
          },
          handleDOMEvents: {
            click: (_view, event) => {
              const target = event.target;
              if (!(target instanceof Element)) return false;
              const mark = target.closest(".compose-grammar-mark");
              if (!(mark instanceof HTMLElement)) return false;
              const index = Number(mark.dataset.grammarI ?? "");
              if (!Number.isFinite(index)) return false;
              const start = Number(mark.dataset.plainStart ?? "");
              const end = Number(mark.dataset.plainEnd ?? "");
              event.preventDefault();
              event.stopPropagation();
              void import("./composeWireGrammarRun").then((m) => {
                if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                  m.applyComposeGrammarSuggestionAtIndex(index, { start, end });
                } else {
                  m.applyComposeGrammarSuggestionAtIndex(index);
                }
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
