import { mergeAttributes } from "@tiptap/core";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";

const CELL_BORDER = "1px solid #787775";
const CELL_PAD = "6px 8px";

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
        bgcolor: "#f2f0ec",
        align: "left",
        valign: "top",
        style: `border:${CELL_BORDER};padding:${CELL_PAD};vertical-align:top;background:#f2f0ec;font-weight:650;`,
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

/** Demande lignes × colonnes (défaut 3×3). Annuler → null. */
export function promptComposeTableSize(): { rows: number; cols: number } | null {
  const rowsRaw = window.prompt("Nombre de lignes du tableau (1–20) :", "3");
  if (rowsRaw == null) return null;
  const colsRaw = window.prompt("Nombre de colonnes du tableau (1–20) :", "3");
  if (colsRaw == null) return null;
  return {
    rows: clampComposeTableDim(Number(rowsRaw.trim()), 3),
    cols: clampComposeTableDim(Number(colsRaw.trim()), 3),
  };
}
