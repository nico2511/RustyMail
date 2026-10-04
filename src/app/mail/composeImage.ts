/**
 * Image du compositeur : largeur libre (curseur + poignées) et trois raccourcis.
 * La largeur est sérialisée en `width` et en `style` inline, pour les clients mail.
 */
import Image from "@tiptap/extension-image";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

export const COMPOSE_IMAGE_MIN_PX = 48;
export const COMPOSE_IMAGE_MAX_PX = 1200;

export const COMPOSE_IMAGE_WIDTH_PRESETS = [
  { id: "s", label: "Petit", px: 200 },
  { id: "m", label: "Moyen", px: 400 },
  { id: "l", label: "Grand", px: 640 },
] as const;

export type ComposeImageResizeEdge = "nw" | "ne" | "sw" | "se";

const RESIZE_EDGES: readonly ComposeImageResizeEdge[] = ["nw", "ne", "sw", "se"];

export function parseComposeImageWidth(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    return n >= 1 && n <= 4000 ? n : null;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,4})(?:px)?$/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 4000 ? n : null;
}

export function clampComposeImageWidth(px: number): number {
  if (!Number.isFinite(px)) return COMPOSE_IMAGE_MIN_PX;
  return Math.round(Math.min(COMPOSE_IMAGE_MAX_PX, Math.max(COMPOSE_IMAGE_MIN_PX, px)));
}

export function composeImageSizeAttrs(width: number | null): { width?: string; style?: string } {
  if (width == null) return {};
  return {
    width: String(width),
    style: `width: ${width}px; height: auto; max-width: 100%;`,
  };
}

export function nextComposeImageWidth(startWidth: number, dx: number, edge: ComposeImageResizeEdge): number {
  const growRight = edge === "ne" || edge === "se";
  return clampComposeImageWidth(startWidth + (growRight ? dx : -dx));
}

/** Largeur de départ d’un glisser. Sans mise en page (largeur rendue nulle), on reprend l’attribut. */
export function composeImageDragStartWidth(renderedPx: number, attrWidth: number | null): number {
  if (Number.isFinite(renderedPx) && renderedPx >= 1) return clampComposeImageWidth(renderedPx);
  if (attrWidth != null) return clampComposeImageWidth(attrWidth);
  return 320;
}

export function writeComposeImageWidth(editor: Editor, pos: number, width: number | null): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image") return false;
  const next = width == null ? null : clampComposeImageWidth(width);
  if (parseComposeImageWidth(node.attrs.width) === next) return false;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      width: next,
    }),
  );
  return true;
}

function imagePos(editor: Editor, src: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.src === src) found = pos;
  });
  return found;
}

export function selectComposeImageSrc(editor: Editor, src: string): void {
  const $from = editor.state.selection.$from;
  const before = $from.nodeBefore;
  if (before?.type.name === "image" && before.attrs.src === src) {
    editor.commands.setNodeSelection($from.pos - before.nodeSize);
    return;
  }
  const pos = imagePos(editor, src);
  if (pos >= 0) editor.commands.setNodeSelection(pos);
}

type DragState = {
  startX: number;
  startWidth: number;
  edge: ComposeImageResizeEdge;
};

export const ComposeImage = Image.extend({
  atom: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const fromAttr = parseComposeImageWidth(element.getAttribute("width"));
          if (fromAttr != null) return fromAttr;
          return parseComposeImageWidth(element.style?.width || "");
        },
        renderHTML: (attributes) => composeImageSizeAttrs(parseComposeImageWidth(attributes.width)),
      },
    };
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      let current: PMNode = node;
      let selected = false;
      let dragging = false;
      let drag: DragState | null = null;
      let alive = true;

      const root = document.createElement(node.isInline ? "span" : "div");
      root.className = "compose-image";
      root.setAttribute("data-compose-image", "");

      const img = document.createElement("img");
      img.className = "compose-image__img";
      img.draggable = false;
      root.appendChild(img);

      const handles = RESIZE_EDGES.map((edge) => {
        const handle = document.createElement("span");
        handle.className = `compose-image__handle compose-image__handle--${edge}`;
        handle.dataset.composeImageEdge = edge;
        handle.setAttribute("aria-hidden", "true");
        root.appendChild(handle);
        return handle;
      });

      const chrome = document.createElement("span");
      chrome.className = "compose-image__chrome";
      chrome.setAttribute("contenteditable", "false");
      root.appendChild(chrome);

      const presets = COMPOSE_IMAGE_WIDTH_PRESETS.map((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "compose-image__preset";
        button.dataset.composeImageWidth = String(preset.px);
        button.textContent = preset.label;
        button.title = `${preset.px} px`;
        chrome.appendChild(button);
        return button;
      });

      const original = document.createElement("button");
      original.type = "button";
      original.className = "compose-image__preset";
      original.dataset.composeImageWidth = "auto";
      original.textContent = "Origine";
      original.title = "Taille d’origine";
      chrome.appendChild(original);

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "compose-image__slider";
      slider.min = String(COMPOSE_IMAGE_MIN_PX);
      slider.max = String(COMPOSE_IMAGE_MAX_PX);
      slider.step = "1";
      slider.setAttribute("aria-label", "Taille de l’image");
      chrome.appendChild(slider);

      const readout = document.createElement("span");
      readout.className = "compose-image__readout";
      readout.setAttribute("aria-hidden", "true");
      chrome.appendChild(readout);

      const explicitWidth = () => parseComposeImageWidth(current.attrs.width);

      const renderFrame = (width: number | null) => {
        if (width == null) {
          root.style.removeProperty("width");
          img.style.removeProperty("width");
        } else {
          root.style.width = `${width}px`;
          img.style.width = "100%";
        }
        img.removeAttribute("width");
        img.style.height = "auto";
        img.style.maxWidth = "100%";
        const sliderPx = width ?? composeImageDragStartWidth(img.getBoundingClientRect().width, null);
        slider.max = String(Math.max(COMPOSE_IMAGE_MAX_PX, sliderPx));
        if (document.activeElement !== slider) slider.value = String(sliderPx);
        slider.setAttribute("aria-valuenow", slider.value);
        slider.setAttribute("aria-valuemin", slider.min);
        slider.setAttribute("aria-valuemax", slider.max);
        slider.setAttribute("aria-valuetext", width == null ? "Taille d’origine" : `${width} pixels`);
        readout.textContent = width == null ? "Auto" : `${width} px`;
        for (const button of presets) {
          const active = Number(button.dataset.composeImageWidth) === width;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        }
        const originActive = width == null;
        original.classList.toggle("is-active", originActive);
        original.setAttribute("aria-pressed", originActive ? "true" : "false");
        root.classList.toggle("is-selected", selected && editor.isEditable);
      };

      const syncAttrs = () => {
        const src = String(current.attrs.src ?? "");
        if (img.getAttribute("src") !== src) img.setAttribute("src", src);
        const alt = current.attrs.alt == null ? "" : String(current.attrs.alt);
        if (img.getAttribute("alt") !== alt) img.setAttribute("alt", alt);
        const title = current.attrs.title == null ? "" : String(current.attrs.title);
        if (title) img.setAttribute("title", title);
        else img.removeAttribute("title");
      };

      const paint = () => {
        syncAttrs();
        if (!dragging) renderFrame(explicitWidth());
        else root.classList.toggle("is-selected", selected && editor.isEditable);
      };

      const commit = (width: number | null) => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        writeComposeImageWidth(editor, pos, width);
      };

      const onMove = (event: PointerEvent) => {
        if (!drag) return;
        renderFrame(nextComposeImageWidth(drag.startWidth, event.clientX - drag.startX, drag.edge));
      };

      const endDrag = (event: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", endDrag);
        window.removeEventListener("pointercancel", endDrag);
        const active = drag;
        drag = null;
        dragging = false;
        if (!active) {
          paint();
          return;
        }
        commit(nextComposeImageWidth(active.startWidth, event.clientX - active.startX, active.edge));
        paint();
      };

      const startDrag = (edge: ComposeImageResizeEdge, event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = getPos();
        if (typeof pos === "number") {
          const selection = editor.state.selection;
          const already = selection instanceof NodeSelection && selection.from === pos;
          if (!already) editor.commands.setNodeSelection(pos);
        }
        if (!alive) return;
        dragging = true;
        drag = {
          edge,
          startX: event.clientX,
          startWidth: composeImageDragStartWidth(img.getBoundingClientRect().width, explicitWidth()),
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);
      };

      for (const handle of handles) {
        handle.addEventListener("pointerdown", (event) => {
          const edge = handle.dataset.composeImageEdge;
          if (edge === "nw" || edge === "ne" || edge === "sw" || edge === "se") startDrag(edge, event);
        });
      }

      for (const button of [...presets, original]) {
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const raw = button.dataset.composeImageWidth;
          commit(raw === "auto" || raw == null ? null : clampComposeImageWidth(Number(raw)));
        });
      }

      slider.addEventListener("input", () => {
        const next = clampComposeImageWidth(Number(slider.value));
        renderFrame(next);
        commit(next);
      });
      slider.addEventListener("change", () => {
        commit(clampComposeImageWidth(Number(slider.value)));
      });

      paint();

      return {
        dom: root,
        update: (updated: PMNode) => {
          if (updated.type !== current.type) return false;
          current = updated;
          paint();
          return true;
        },
        selectNode: () => {
          selected = true;
          paint();
        },
        deselectNode: () => {
          selected = false;
          paint();
        },
        stopEvent: (event: Event) => {
          const target = event.target;
          if (!(target instanceof Element)) return false;
          return Boolean(target.closest(".compose-image__chrome, .compose-image__handle"));
        },
        ignoreMutation: () => true,
        destroy: () => {
          alive = false;
          drag = null;
          dragging = false;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", endDrag);
          window.removeEventListener("pointercancel", endDrag);
        },
      };
    };
  },
});
