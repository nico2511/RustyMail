/**
 * Image du compositeur : poignées de redimensionnement + menu taille au clic droit.
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

let openSizeMenu: HTMLElement | null = null;

function closeComposeImageSizeMenu(): void {
  if (!openSizeMenu) return;
  openSizeMenu.remove();
  openSizeMenu = null;
  window.removeEventListener("pointerdown", onGlobalPointerClose, true);
  window.removeEventListener("keydown", onGlobalKeyClose, true);
  window.removeEventListener("scroll", closeComposeImageSizeMenu, true);
  window.removeEventListener("blur", closeComposeImageSizeMenu);
}

function onGlobalPointerClose(event: PointerEvent): void {
  if (!openSizeMenu) return;
  const target = event.target;
  if (target instanceof Node && openSizeMenu.contains(target)) return;
  closeComposeImageSizeMenu();
}

function onGlobalKeyClose(event: KeyboardEvent): void {
  if (event.key === "Escape") closeComposeImageSizeMenu();
}

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
  if (parseComposeImageWidth(node.attrs.width) === next) return true;
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    width: next,
  });
  try {
    tr.setSelection(NodeSelection.create(tr.doc, pos));
  } catch {
    /* position invalide après mutation */
  }
  editor.view.dispatch(tr);
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

function resolveImagePos(editor: Editor, getPos: () => number | undefined): number | null {
  const sel = editor.state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "image") {
    return sel.from;
  }
  const pos = getPos();
  return typeof pos === "number" ? pos : null;
}

type DragState = {
  startX: number;
  startWidth: number;
  edge: ComposeImageResizeEdge;
};

function openSizeMenuAt(opts: {
  clientX: number;
  clientY: number;
  currentWidth: number | null;
  renderedWidth: number;
  onCommit: (width: number | null) => void;
  onPreview: (width: number | null) => void;
}): void {
  closeComposeImageSizeMenu();
  const menu = document.createElement("div");
  menu.className = "compose-image-size-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Taille de l’image");

  const title = document.createElement("div");
  title.className = "compose-image-size-menu__title";
  title.textContent = "Taille";
  menu.appendChild(title);

  const presetsRow = document.createElement("div");
  presetsRow.className = "compose-image-size-menu__presets";
  for (const preset of COMPOSE_IMAGE_WIDTH_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compose-image-size-menu__preset";
    button.dataset.composeImageWidth = String(preset.px);
    button.textContent = preset.label;
    button.title = `${preset.px} px`;
    button.setAttribute("role", "menuitem");
    if (opts.currentWidth === preset.px) button.classList.add("is-active");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      opts.onCommit(preset.px);
      closeComposeImageSizeMenu();
    });
    presetsRow.appendChild(button);
  }
  const original = document.createElement("button");
  original.type = "button";
  original.className = "compose-image-size-menu__preset";
  original.dataset.composeImageWidth = "auto";
  original.textContent = "Origine";
  original.title = "Taille d’origine";
  original.setAttribute("role", "menuitem");
  if (opts.currentWidth == null) original.classList.add("is-active");
  original.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    opts.onCommit(null);
    closeComposeImageSizeMenu();
  });
  presetsRow.appendChild(original);
  menu.appendChild(presetsRow);

  const sliderRow = document.createElement("div");
  sliderRow.className = "compose-image-size-menu__slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "compose-image-size-menu__slider";
  slider.min = String(COMPOSE_IMAGE_MIN_PX);
  slider.max = String(COMPOSE_IMAGE_MAX_PX);
  slider.step = "1";
  const sliderStart = opts.currentWidth ?? clampComposeImageWidth(opts.renderedWidth || 320);
  slider.value = String(sliderStart);
  slider.setAttribute("aria-label", "Largeur en pixels");
  const readout = document.createElement("span");
  readout.className = "compose-image-size-menu__readout";
  readout.textContent = opts.currentWidth == null ? "Auto" : `${opts.currentWidth} px`;
  slider.addEventListener("input", () => {
    const next = clampComposeImageWidth(Number(slider.value));
    readout.textContent = `${next} px`;
    opts.onPreview(next);
  });
  slider.addEventListener("change", () => {
    opts.onCommit(clampComposeImageWidth(Number(slider.value)));
  });
  sliderRow.appendChild(slider);
  sliderRow.appendChild(readout);
  menu.appendChild(sliderRow);

  document.body.appendChild(menu);
  openSizeMenu = menu;

  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = opts.clientX;
  let top = opts.clientY;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;

  window.addEventListener("pointerdown", onGlobalPointerClose, true);
  window.addEventListener("keydown", onGlobalKeyClose, true);
  window.addEventListener("scroll", closeComposeImageSizeMenu, true);
  window.addEventListener("blur", closeComposeImageSizeMenu);
}

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
        const pos = resolveImagePos(editor, getPos);
        if (pos == null) return;
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
        closeComposeImageSizeMenu();
        const pos = resolveImagePos(editor, getPos);
        if (pos != null) {
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

      const openMenu = (event: Event) => {
        if (!editor.isEditable) return;
        if (!(event instanceof MouseEvent)) return;
        event.preventDefault();
        event.stopPropagation();
        const pos = resolveImagePos(editor, getPos);
        if (pos != null) editor.commands.setNodeSelection(pos);
        openSizeMenuAt({
          clientX: event.clientX,
          clientY: event.clientY,
          currentWidth: explicitWidth(),
          renderedWidth: img.getBoundingClientRect().width,
          onPreview: (width) => renderFrame(width),
          onCommit: (width) => {
            commit(width);
            paint();
          },
        });
      };

      root.addEventListener("contextmenu", openMenu);
      img.addEventListener("contextmenu", openMenu);

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
          closeComposeImageSizeMenu();
          paint();
        },
        stopEvent: (event: Event) => {
          const target = event.target;
          if (!(target instanceof Element)) return false;
          if (event.type === "contextmenu") return true;
          return Boolean(target.closest(".compose-image__handle"));
        },
        ignoreMutation: () => true,
        destroy: () => {
          alive = false;
          drag = null;
          dragging = false;
          closeComposeImageSizeMenu();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", endDrag);
          window.removeEventListener("pointercancel", endDrag);
        },
      };
    };
  },
});
