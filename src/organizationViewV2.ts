/** Organiser V2 — file d’actions avec mémoire (V1 reste accessible séparément). */

import { invoke } from "@tauri-apps/api/core";
import { navRenderTrailHtml } from "./navigation";
import {
  formatOrgApplyImpact,
  optimisticPatchOrgReport,
  orgApplyProposal,
  type OrgActionOverride,
  type OrgApplyProgress,
  type OrgProposal,
  type OrgScanReport,
  type OrgThreadRef,
} from "./organizationView";

export type OrgV2MemorySummary = {
  suppressedCount: number;
  ignoredMailboxes: string[];
};

export type OrgV2ScanReport = {
  proposals: OrgProposal[];
  stats: { threadCount: number; mailboxCount: number };
  mailboxStructure: OrgScanReport["mailboxStructure"];
  memory: OrgV2MemorySummary;
  focusNote: string;
};

export type OrganizationV2ViewState = {
  scanning: boolean;
  applying: boolean;
  /** Demande d’arrêt entre deux chunks d’apply. */
  applyCancelRequested: boolean;
  /** Progression apply (affichage). */
  applyDone: number;
  applyTotal: number | null;
  report: OrgV2ScanReport | null;
  applyMessage: string;
  trashConfirmOpen: boolean;
  pendingTrashProposalId: string | null;
  pendingTrashActionOverride: OrgActionOverride | null;
  deleteMailboxConfirmOpen: boolean;
  pendingDeleteMailboxProposalId: string | null;
};

export type OrgV2RenderDeps = {
  escapeHtml: (s: string) => string;
  escapeAttr: (s: string) => string;
  iconSvg: (name: string) => string;
  renderThreadSample: (ref: OrgThreadRef, proposal: OrgProposal) => string;
  mailboxLabel: (mailbox: string) => string;
};

export function defaultOrganizationV2State(): OrganizationV2ViewState {
  return {
    scanning: false,
    applying: false,
    applyCancelRequested: false,
    applyDone: 0,
    applyTotal: null,
    report: null,
    applyMessage: "",
    trashConfirmOpen: false,
    pendingTrashProposalId: null,
    pendingTrashActionOverride: null,
    deleteMailboxConfirmOpen: false,
    pendingDeleteMailboxProposalId: null,
  };
}

/** Taille d’un lot IMAP pour progression UI (apply V2). */
export const ORG_V2_APPLY_CHUNK_SIZE = 25;

export function collectOrgProposalApplyIds(
  proposal: OrgProposal,
  threadIds?: string[] | null,
): string[] {
  if (threadIds && threadIds.length > 0) {
    return Array.from(
      new Set(threadIds.map((s) => String(s ?? "").trim()).filter(Boolean)),
    );
  }
  const fromRefs = (proposal.threadRefs ?? [])
    .map((r) => String(r.threadId ?? "").trim())
    .filter(Boolean);
  const fromIds = (proposal.threadIds ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set([...fromRefs, ...fromIds]));
}

export function chunkStringIds(ids: string[], size: number): string[][] {
  const n = Math.max(1, size);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += n) {
    out.push(ids.slice(i, i + n));
  }
  return out;
}

export function mergeOrgApplyProgress(
  a: OrgApplyProgress,
  b: OrgApplyProgress,
): OrgApplyProgress {
  return {
    done: (a.done ?? 0) + (b.done ?? 0),
    total: Math.max(a.total ?? 0, b.total ?? 0),
    message: b.message || a.message,
    errors: [...(a.errors ?? []), ...(b.errors ?? [])],
    mailboxesToSync: Array.from(
      new Set([...(a.mailboxesToSync ?? []), ...(b.mailboxesToSync ?? [])]),
    ),
    threadsAffected: Array.from(
      new Set([...(a.threadsAffected ?? []), ...(b.threadsAffected ?? [])]),
    ),
  };
}

export function orgV2ProposalBatchCleared(proposal: OrgProposal | undefined): boolean {
  if (!proposal || proposal.applicable === false) return true;
  const threadN = proposal.threadRefs.filter((r) => !r.threadId.startsWith("mailbox:")).length;
  const mbN = proposal.threadRefs.filter((r) => r.threadId.startsWith("mailbox:")).length;
  return (proposal.totalCount ?? 0) === 0 && threadN === 0 && mbN === 0;
}

export async function orgV2ScanAccount(accountId: string): Promise<OrgV2ScanReport> {
  return invoke<OrgV2ScanReport>("org_v2_scan_account_cmd", {
    payload: { accountId },
  });
}

export async function orgV2RecordDecision(
  accountId: string,
  proposal: OrgProposal,
  decision: "applied" | "dismissed" | "snoozed",
  snoozeDays?: number,
): Promise<void> {
  await invoke("org_v2_record_decision_cmd", {
    payload: {
      accountId,
      proposalSnapshot: proposal,
      decision,
      snoozeDays: snoozeDays ?? null,
    },
  });
}

export async function orgV2IgnoreMailbox(accountId: string, mailbox: string): Promise<void> {
  await invoke("org_v2_ignore_mailbox_cmd", {
    payload: { accountId, mailbox },
  });
}

export async function orgV2UnignoreMailbox(accountId: string, mailbox: string): Promise<void> {
  await invoke("org_v2_unignore_mailbox_cmd", {
    payload: { accountId, mailbox },
  });
}

function isMailboxRef(ref: OrgThreadRef): boolean {
  return ref.threadId.startsWith("mailbox:");
}

function dedupeThreadRefs(refs: OrgThreadRef[]): OrgThreadRef[] {
  const seen = new Set<string>();
  const out: OrgThreadRef[] = [];
  for (const r of refs) {
    if (isMailboxRef(r)) continue;
    const key = `${r.threadId}\0${r.mailbox}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function batchActionLabel(p: OrgProposal): string {
  switch (p.suggestedAction) {
    case "archive":
      return "Tout archiver";
    case "trash":
      return "Tout mettre en corbeille";
    case "deleteMailbox":
      return "Supprimer les dossiers vides";
    case "move":
      return p.targetMailbox ? `Tout déplacer → ${p.targetMailbox}` : "Tout déplacer";
    default:
      return "Appliquer";
  }
}

function isProposalApplicable(p: OrgProposal): boolean {
  return p.applicable !== false;
}

/** Retire une carte du rapport V2 (après apply / dismiss / snooze). */
export function optimisticOrgV2RemoveProposal(
  report: OrgV2ScanReport,
  proposalId: string,
): OrgV2ScanReport {
  return {
    ...report,
    proposals: report.proposals.filter((p) => p.id !== proposalId),
  };
}

/** Patch local après apply partiel (même logique que V1). */
export function optimisticOrgV2PatchAfterApply(
  report: OrgV2ScanReport,
  proposalId: string,
  progress: OrgApplyProgress,
): OrgV2ScanReport {
  const asV1: OrgScanReport = {
    proposals: report.proposals,
    stats: report.stats,
    mailboxStructure: report.mailboxStructure,
  };
  const patched = optimisticPatchOrgReport(asV1, proposalId, progress);
  return { ...report, proposals: patched.proposals };
}

export function renderOrganizationV2View(
  state: OrganizationV2ViewState,
  deps: OrgV2RenderDeps,
): string {
  const { escapeHtml, escapeAttr, iconSvg, renderThreadSample, mailboxLabel } = deps;
  const report = state.report;

  const mailboxChip = (mb: string, opts?: { showIgnore?: boolean }) => {
    const ignoreBtn =
      opts?.showIgnore !== false
        ? `<button type="button" class="ghost-button org-v2-ignore-mb" data-action="org-v2-ignore-mailbox" data-mailbox="${escapeAttr(mb)}" title="Ne plus analyser ce dossier">Exclure</button>`
        : "";
    return `<span class="org-mailbox-chip-wrap">
      <button type="button" class="org-mailbox-chip" data-action="org-open-mailbox" data-mailbox="${escapeAttr(mb)}" title="Ouvrir le dossier">${escapeHtml(mailboxLabel(mb))}</button>
      ${ignoreBtn}
    </span>`;
  };

  const ignoredSet = new Set(report?.memory.ignoredMailboxes ?? []);
  const ignoredListHtml =
    ignoredSet.size === 0
      ? ""
      : `<div class="org-v2-ignored">
          <p class="org-v2-ignored__title">Dossiers exclus de l’analyse</p>
          <ul class="org-v2-ignored__list">
            ${[...ignoredSet]
              .map(
                (mb) =>
                  `<li><span class="org-v2-ignored__path">${escapeHtml(mailboxLabel(mb))}</span>
                    <button type="button" class="ghost-button" data-action="org-v2-unignore-mailbox" data-mailbox="${escapeAttr(mb)}">Réinclure</button></li>`,
              )
              .join("")}
          </ul>
        </div>`;

  const memoryBanner = report
    ? `<p class="org-v2-memory dim" role="status">
        ${report.memory.suppressedCount > 0 ? `${report.memory.suppressedCount} proposition(s) masquée(s) par la mémoire. ` : ""}
        ${report.focusNote}
      </p>${ignoredListHtml}`
    : "";

  const cards = report?.proposals ?? [];
  const cardsHtml =
    cards.length === 0
      ? `<p class="dim org-empty">Aucune action en attente. Les cartes déjà traitées ou reportées ne réapparaissent pas.</p>`
      : cards
          .map((p) => {
            const threadSamples = dedupeThreadRefs(p.threadRefs);
            const mailboxSamples = p.threadRefs.filter((r) => isMailboxRef(r)).slice(0, 12);
            const rowSamples = [...threadSamples, ...mailboxSamples].slice(0, 12);
            const samplesHtml = rowSamples.map((r) => renderThreadSample(r, p)).join("");
            const mailboxes = [...new Set(p.threadRefs.map((r) => r.mailbox?.trim()).filter(Boolean))] as string[];
            const mailboxChipsHtml =
              mailboxes.length > 0
                ? `<div class="org-mailbox-chips">${mailboxes.map((mb) => mailboxChip(mb)).join("")}</div>`
                : "";
            const advisoryOnly = !isProposalApplicable(p);
            const countLabel =
              mailboxSamples.length > 0 || (p.threadRefs[0] && isMailboxRef(p.threadRefs[0]))
                ? `${p.totalCount} dossier(s)`
                : `${p.totalCount} fil(s)`;
            const isTrash = p.suggestedAction === "trash";
            const isDeleteMailbox = p.suggestedAction === "deleteMailbox";
            const applyingAttr = state.applying ? " disabled" : "";
            const explainHtml =
              p.explainSignals && p.explainSignals.length > 0
                ? `<p class="org-card__explain dim">${escapeHtml(p.explainSignals.join(" · "))}</p>`
                : "";
            return `<article class="org-card org-card--v2" data-org-proposal-id="${escapeHtml(p.id)}">
              <header class="org-card__head">
                <h3 class="org-card__title">${escapeHtml(p.title)}</h3>
                <span class="org-card__count">${countLabel}</span>
              </header>
              <p class="org-card__rationale">${escapeHtml(p.rationale)}</p>
              ${explainHtml}
              ${mailboxChipsHtml}
              ${
                samplesHtml
                  ? `<div class="inbox-thread-list org-proposal-thread-list" role="list">${samplesHtml}</div>`
                  : advisoryOnly
                    ? `<p class="dim">Conseil structurel — pas d’application automatique.</p>`
                    : ""
              }
              <div class="org-card__actions org-card__actions--multi org-card__actions--v2">
                ${
                  advisoryOnly
                    ? `<button type="button" class="ghost-button" data-action="org-v2-dismiss" data-proposal-id="${escapeHtml(p.id)}"${applyingAttr}>Ne plus afficher</button>`
                    : `<button type="button" class="primary-button" data-action="org-v2-apply" data-proposal-id="${escapeHtml(p.id)}" data-trash="${isTrash ? "1" : "0"}" data-delete-mailbox="${isDeleteMailbox ? "1" : "0"}"${applyingAttr}>${escapeHtml(batchActionLabel(p))}</button>
                       <button type="button" class="ghost-button" data-action="org-v2-dismiss" data-proposal-id="${escapeHtml(p.id)}"${applyingAttr}>Ignorer</button>
                       <button type="button" class="ghost-button" data-action="org-v2-snooze" data-proposal-id="${escapeHtml(p.id)}"${applyingAttr}>Reporter 7 j</button>`
                }
              </div>
            </article>`;
          })
          .join("");

  const pendingTrashProposal = state.pendingTrashProposalId
    ? report?.proposals.find((p) => p.id === state.pendingTrashProposalId)
    : undefined;
  const trashImpactHtml = pendingTrashProposal
    ? `<pre class="org-impact-summary">${escapeHtml(
        formatOrgApplyImpact(pendingTrashProposal, state.pendingTrashActionOverride ?? "trash"),
      )}</pre>`
    : "";

  const pendingDeleteMbProposal = state.pendingDeleteMailboxProposalId
    ? report?.proposals.find((p) => p.id === state.pendingDeleteMailboxProposalId)
    : undefined;
  const deleteMbImpactHtml = pendingDeleteMbProposal
    ? `<pre class="org-impact-summary">${escapeHtml(formatOrgApplyImpact(pendingDeleteMbProposal))}</pre>`
    : "";

  const trashModal = state.trashConfirmOpen
    ? `<div class="org-modal-backdrop" data-action="org-v2-trash-cancel">
        <div class="org-modal modal-shell-stop-prop" role="dialog" aria-modal="true">
          <h2>Confirmer la corbeille</h2>
          ${trashImpactHtml}
          <p><label class="settings-form-check"><input type="checkbox" id="org-v2-trash-check" /> Je comprends</label></p>
          <div class="org-modal__actions">
            <button type="button" class="ghost-button" data-action="org-v2-trash-cancel">Annuler</button>
            <button type="button" class="primary-button" data-action="org-v2-trash-confirm" disabled id="org-v2-trash-confirm-btn">Mettre en corbeille</button>
          </div>
        </div>
      </div>`
    : "";

  const deleteMailboxModal = state.deleteMailboxConfirmOpen
    ? `<div class="org-modal-backdrop" data-action="org-v2-delete-mailbox-cancel">
        <div class="org-modal modal-shell-stop-prop" role="dialog" aria-modal="true">
          <h2>Supprimer les dossiers vides ?</h2>
          ${deleteMbImpactHtml}
          <p><label class="settings-form-check"><input type="checkbox" id="org-v2-delete-mailbox-check" /> Je comprends</label></p>
          <div class="org-modal__actions">
            <button type="button" class="ghost-button" data-action="org-v2-delete-mailbox-cancel">Annuler</button>
            <button type="button" class="primary-button" data-action="org-v2-delete-mailbox-confirm" disabled id="org-v2-delete-mailbox-confirm-btn">Supprimer</button>
          </div>
        </div>
      </div>`
    : "";

  return `<section class="thread-view organization-index organization-v2-index" aria-label="Organiser V2">
    <header class="inbox-appbar organization-appbar">
      <div class="inbox-appbar-top">
        <div class="inbox-appbar-intro">
          ${navRenderTrailHtml("Organiser V2", escapeHtml, escapeAttr, { navClass: "secondary-view-nav" })}
          <h1 class="organization-title inbox-mailbox-title">${iconSvg("archive")}<span>Organiser V2</span></h1>
          <p class="dim organization-lead">Structurer la boîte, réduire le bruit, mémoriser vos décisions. La recherche et les tags restent ailleurs.</p>
        </div>
      </div>
      <div class="organization-toolbar">
        <button type="button" class="primary-button" data-action="org-v2-scan" ${state.scanning ? "disabled" : ""}>
          ${state.scanning ? "Analyse…" : "Analyser"}
        </button>
        ${report ? `<span class="dim"> ${report.proposals.length} action(s) · ${report.stats.threadCount} fils</span>` : ""}
      </div>
      ${
        state.applyMessage
          ? `<p class="org-apply-msg" role="status">${escapeHtml(state.applyMessage)}${
              state.applying
                ? ` <button type="button" class="ghost-button" data-action="org-v2-cancel-apply">Arrêter</button>`
                : ""
            }</p>`
          : ""
      }
      ${memoryBanner}
    </header>
    <div class="inbox-panel surface organization-panel organization-v2-panel">
      ${report ? `<div class="org-cards org-cards--v2">${cardsHtml}</div>` : `<p class="dim org-hint">Lancez une analyse pour voir la file d’actions.</p>`}
      ${trashModal}
      ${deleteMailboxModal}
      <p class="org-v2-affiner-note dim">Pour structurer un flux par critères, utilisez les <strong>vues enregistrées</strong>. Le bouton <strong>Affiner</strong> (LLM) apparaît sous une recherche ou vue ouverte — nécessite « Propositions Organiser (LLM) » dans Paramètres → IA.</p>
    </div>
  </section>`;
}
