import { invoke } from "@tauri-apps/api/core";
import type { Draft, DraftDiffLine, DraftPreview } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { escapeHtml } from "../../ui/sanitize";

export type ComposeDraftRevisionDiffDeps = {
  persistDraft: () => void;
};

let composeDraftRevisionDiffDeps: ComposeDraftRevisionDiffDeps | null = null;

export function registerComposeDraftRevisionDiffDeps(deps: ComposeDraftRevisionDiffDeps): void {
  composeDraftRevisionDiffDeps = deps;
}

function splitLines(input: string): string[] {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function myersDiffLines(a: string[], b: string[]): DraftDiffLine[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  let v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;
      const down = k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1]);
      let x = down ? v[kIndex + 1] : v[kIndex - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[kIndex] = x;
      if (x >= n && y >= m) {
        const out: DraftDiffLine[] = [];
        let curX = n;
        let curY = m;
        for (let curD = d; curD >= 0; curD--) {
          const prevV = trace[curD];
          const curK = curX - curY;
          const curKIndex = curK + offset;
          const prevDown =
            curK === -curD || (curK !== curD && prevV[curKIndex - 1] < prevV[curKIndex + 1]);
          const prevK = prevDown ? curK + 1 : curK - 1;
          const prevX = prevDown ? prevV[prevK + offset] : prevV[prevK + offset] + 1;
          const prevY = prevX - prevK;
          while (curX > prevX && curY > prevY) {
            out.push({ kind: "eq", text: a[curX - 1] });
            curX--;
            curY--;
          }
          if (curD === 0) break;
          if (prevDown) {
            out.push({ kind: "add", text: b[curY - 1] });
            curY--;
          } else {
            out.push({ kind: "del", text: a[curX - 1] });
            curX--;
          }
        }
        out.reverse();
        return out;
      }
    }
  }
  return [
    ...a.map((t) => ({ kind: "del" as const, text: t })),
    ...b.map((t) => ({ kind: "add" as const, text: t })),
  ];
}

export async function computeDraftDiffAgainstRevision(revisionId: string): Promise<void> {
  const d = composeDraftRevisionDiffDeps;
  if (!d) throw new Error("registerComposeDraftRevisionDiffDeps not called");
  const rid = revisionId.trim();
  const accountId = currentAccount()?.id?.trim() ?? "";
  if (!isTauriRuntime() || !rid || !accountId) return;
  if (!state.draft) return;
  d.persistDraft();

  state.draftDiffRevisionId = rid;
  state.draftDiffLoading = true;
  state.draftDiffLines = [];
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  render();

  try {
    const other = await withTimeout(
      invoke<Draft | null>("draft_revision_restore", { accountId, revisionId: rid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    if (!other) {
      toast("Cette version n’existe plus.");
      state.draftDiffLoading = false;
      render();
      return;
    }
    const curBody = state.draft.markdownBody ?? "";
    const otherBody = other.markdownBody ?? "";
    state.draftDiffOtherBody = otherBody;
    state.draftRevisionPreview = await safeInvoke<DraftPreview>(
      "preview_draft",
      { markdownBody: otherBody },
      {
        textPlain: otherBody,
        html: `<p>${escapeHtml(otherBody).replace(/\n/g, "<br />")}</p>`,
      },
    );
    const a = splitLines(curBody);
    const b = splitLines(otherBody);
    if (a.length + b.length > 8000) {
      toast("Diff trop volumineux : affichez une version plus courte (limite lignes).");
      state.draftDiffLines = [];
    } else {
      state.draftDiffLines = myersDiffLines(a, b);
    }
  } catch (error) {
    console.error("draft_revision_restore (diff)", error);
    toast(`Diff impossible: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftDiffLoading = false;
    render();
  }
}
