import { mergeAttributes } from "@tiptap/core";
import { openTextPromptModal } from "../modals/promptConfirm";
import { toast } from "../lib/toast";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";

const CELL_BORDER = "1px solid #787775";
const CELL_PAD = "6px 8px";
/** Fond clair d’en-tête e-mail — texte sombre obligatoire (le compositeur hérite sinon de `--text` clair). */
const HEADER_BG = "#f2f0ec";
const HEADER_FG = "#1c1b19";

/** Tableau TipTap avec attrs e-mail (bordures / en-tête) pour survivre à l’envoi. */
export const ComposeTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "table",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "rm-mail-data",
        border: "1",
        cellpadding: "6",
        cellspacing: "0",
        width: "100%",
      }),
      ["tbody", 0],
    ];
  },
});

export const ComposeTableRow = TableRow;

export const ComposeTableHeader = TableHeader.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "th",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        bgcolor: HEADER_BG,
        align: "left",
        valign: "top",
        style: `border:${CELL_BORDER};padding:${CELL_PAD};vertical-align:top;background:${HEADER_BG};color:${HEADER_FG};font-weight:650;`,
      }),
      0,
    ];
  },
});

export const ComposeTableCell = TableCell.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "td",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        align: "left",
        valign: "top",
        style: `border:${CELL_BORDER};padding:${CELL_PAD};vertical-align:top;`,
      }),
      0,
    ];
  },
});

export function clampComposeTableDim(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(20, Math.round(n)));
}

function parseComposeTableDim(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

/** Demande lignes × colonnes (défaut 3×3). Annuler ou valeur hors 1–20 → null (pas d'insertion). */
export async function promptComposeTableSize(): Promise<{ rows: number; cols: number } | null> {
  const rowsRaw = await openTextPromptModal({
    title: "Insérer un tableau",
    label: "Nombre de lignes (1–20)",
    defaultValue: "3",
  });
  if (rowsRaw == null) return null;
  const rows = parseComposeTableDim(rowsRaw);
  if (rows == null) {
    toast.warning("Nombre de lignes : entier entre 1 et 20.");
    return null;
  }
  const colsRaw = await openTextPromptModal({
    title: "Insérer un tableau",
    label: "Nombre de colonnes (1–20)",
    defaultValue: "3",
  });
  if (colsRaw == null) return null;
  const cols = parseComposeTableDim(colsRaw);
  if (cols == null) {
    toast.warning("Nombre de colonnes : entier entre 1 et 20.");
    return null;
  }
  return { rows, cols };
}
