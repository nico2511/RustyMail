/** Centre d'organisation — scan, cartes, application par lots. */

import { invoke } from "@tauri-apps/api/core";
import { navRenderTrailHtml } from "./navigation";

export type OrgProposalKind =
  | "unreadOutsideInbox"
  | "staleInboxRead"
  | "unsubscribeNewsletter"
  | "unsubscribeTransactional"
  | "newsletterRuleUnfiled"
  | "transactionalNotification"
  | "bulkTrashCandidate"
  | "customKeywordCluster"
  | "duplicateThreadCrossMailbox"
  | "orphanThreadRepair"
  | "staleTags"
  | "semanticTagRefresh"
  | "emptyMailbox"
  | "flatMailboxTree"
  | "llmCluster";

export type OrgMailboxEntry = {
  mailbox: string;
  threadCount: number;
  messageCount: number;
  depth: number;
  isSystem: boolean;
  isEmpty: boolean;
};

export type OrgMailboxStructure = {
  totalFolders: number;
  foldersWithMessages: number;
  rootPersonalCount: number;
  maxDepth: number;
  summaryLines: string[];
  entries: OrgMailboxEntry[];
};

export type OrgSuggestedAction =
  | "move"
  | "archive"
  | "trash"
  | "markRead"
  | "retag"
  | "repairThreading"
  | "deleteMailbox";

export type OrgThreadRef = {
  threadId: string;
  mailbox: string;
  subject: string;
  fromLabel?: string | null;
  preview?: string | null;
  lastActivity?: string | null;
  unread?: boolean | null;
  senderEmail?: string | null;
  unsubscribeLinks?: string[];
};

export type OrgActionOverride = "trash" | "archive" | "markRead";

export type OrgProposal = {
  id: string;
  kind: OrgProposalKind;
  section: string;
  title: string;
  rationale: string;
  threadRefs: OrgThreadRef[];
  threadIds: string[];
  suggestedAction: OrgSuggestedAction;
  targetMailbox?: string | null;
  confidence: number;
  source: "heuristic" | "llm";
  totalCount: number;
  /** `false` = conseil sans bouton d’application (ex. arbre plat). */
  applicable?: boolean;
  explainRuleId?: string | null;
  explainSignals?: string[];
  unsubscribeLinks?: string[];
};

export type OrgScanLlmStatus = {
  requested?: boolean;
  enabled?: boolean;
  succeeded?: boolean;
  proposalCount?: number;
  message?: string | null;
};

export type OrgScanReport = {
  proposals: OrgProposal[];
  stats: { threadCount: number; mailboxCount: number };
  mailboxStructure: OrgMailboxStructure;
  llmStatus?: OrgScanLlmStatus;
};

export type OrgApplyProgress = {
  done: number;
  total: number;
  message: string;
  errors: string[];
  mailboxesToSync: string[];
  threadsAffected?: string[];
};

export type OrganizationViewState = {
  scanning: boolean;
  applying: boolean;
  report: OrgScanReport | null;
  applyMessage: string;
  trashConfirmOpen: boolean;
  pendingTrashProposalId: string | null;
  /** Lot corbeille via « Tout en corbeille » (override) vs action suggérée de la carte. */
  pendingTrashActionOverride: OrgActionOverride | null;
  deleteMailboxConfirmOpen: boolean;
  pendingDeleteMailboxProposalId: string | null;
  /** Dossier en cours de sync (ligne Organiser). */
  rowSyncMailbox: string | null;
};

export type OrgRenderDeps = {
  escapeHtml: (s: string) => string;
  escapeAttr: (s: string) => string;
  iconSvg: (name: string) => string;
  renderThreadSample: (ref: OrgThreadRef, proposal: OrgProposal) => string;
  mailboxLabel: (mailbox: string) => string;
};

export function defaultOrganizationState(): OrganizationViewState {
  return {
    scanning: false,
    applying: false,
    report: null,
    applyMessage: "",
    trashConfirmOpen: false,
    pendingTrashProposalId: null,
    pendingTrashActionOverride: null,
    deleteMailboxConfirmOpen: false,
    pendingDeleteMailboxProposalId: null,
    rowSyncMailbox: null,
  };
}

export async function orgScanAccount(
  accountId: string,
  includeLlm: boolean,
): Promise<OrgScanReport> {
  return invoke<OrgScanReport>("org_scan_account_cmd", {
    payload: { accountId, includeLlm },
  });
}

export async function orgApplyProposal(
  accountId: string,
  proposalId: string,
  proposalSnapshot: OrgProposal,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<OrgApplyProgress> {
  return invoke<OrgApplyProgress>("org_apply_proposal_cmd", {
    payload: {
      accountId,
      proposalId,
      proposalSnapshot,
      trashAck: trashAck ?? null,
      deleteMailboxAck: deleteMailboxAck ?? null,
      actionOverride: actionOverride ?? null,
      threadIds: threadIds ?? null,
    },
  });
}

export type OrgApplyPreview = {
  proposalId: string;
  items: Array<{
    threadId: string;
    subject: string;
    fromMailbox: string;
    toMailbox?: string | null;
    action: string;
  }>;
  totalCount: number;
};

export async function orgPreviewProposal(
  accountId: string,
  proposalId: string,
  proposalSnapshot: OrgProposal,
  actionOverride?: OrgActionOverride | null,
  threadIds?: string[] | null,
): Promise<OrgApplyPreview> {
  return invoke<OrgApplyPreview>("org_preview_proposal_cmd", {
    payload: {
      accountId,
      proposalId,
      proposalSnapshot,
      actionOverride: actionOverride ?? null,
      threadIds: threadIds ?? null,
    },
  });
}

export async function orgUndoLast(accountId: string): Promise<OrgApplyProgress> {
  return invoke<OrgApplyProgress>("org_undo_last_cmd", {
    payload: { accountId },
  });
}

export async function moveThreadUnarchive(
  accountId: string,
  threadId: string,
): Promise<{ message: string; destMailbox: string }> {
  return invoke("move_thread_unarchive_cmd", {
    payload: { accountId, threadId },
  });
}

export async function previewAutoArchive(accountId: string): Promise<{
  messageCount: number;
  approxBytes: number;
  mailboxCount: number;
}> {
  return invoke("preview_auto_archive_cmd", { payload: { accountId } });
}

export async function runAutoArchive(accountId: string): Promise<{
  messageCount: number;
  approxBytes: number;
  mailboxCount: number;
}> {
  return invoke("run_auto_archive_cmd", { payload: { accountId } });
}

export async function orgRetagAccount(
  accountId: string,
  dryRun: boolean,
): Promise<OrgApplyProgress> {
  return invoke<OrgApplyProgress>("org_retag_account_cmd", {
    payload: { accountId, dryRun },
  });
}

/** Mise à jour immédiate des cartes après apply (avant rescan complet). */
export function optimisticPatchOrgReport(
  report: OrgScanReport,
  proposalId: string,
  progress: OrgApplyProgress,
): OrgScanReport {
  const affected = new Set((progress.threadsAffected ?? []).map((id) => String(id)));
  const done = Math.max(0, progress.done);

  const proposals = report.proposals
    .map((p) => {
      const isTarget = p.id === proposalId;
      let refs = p.threadRefs;
      if (affected.size > 0) {
        refs = refs.filter((r) => !affected.has(r.threadId));
      } else if (isTarget && done > 0 && p.suggestedAction === "deleteMailbox") {
        let removed = 0;
        refs = refs.filter((r) => {
          if (!isMailboxRef(r) || removed >= done) return true;
          removed += 1;
          return false;
        });
      }
      let totalCount = p.totalCount;
      if (isTarget && done > 0) {
        totalCount = Math.max(0, p.totalCount - done);
      } else if (!isTarget && affected.size > 0) {
        const removed = p.threadRefs.length - refs.length;
        if (removed > 0) totalCount = Math.max(0, p.totalCount - removed);
      }
      const threadIds = refs.filter((r) => !isMailboxRef(r)).map((r) => r.threadId);
      return { ...p, threadRefs: refs, threadIds, totalCount };
    })
    .filter((p) => p.applicable === false || p.totalCount > 0);

  return { ...report, proposals };
}

/** Retire des fils traités depuis une ligne Organiser (corbeille / archiver). */
export function optimisticOrgRemoveThreads(report: OrgScanReport, threadIds: string[]): OrgScanReport {
  const ids = threadIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) return report;
  return optimisticPatchOrgReport(report, "", {
    done: ids.length,
    total: ids.length,
    message: "",
    errors: [],
    mailboxesToSync: [],
    threadsAffected: ids,
  });
}

function isMailboxRef(ref: OrgThreadRef): boolean {
  return ref.threadId.startsWith("mailbox:");
}

function isTrashLikeMailbox(name: string): boolean {
  const l = name.trim().toLowerCase();
  return (
    l.includes("trash") ||
    l.includes("corbeille") ||
    l.includes("poubelle") ||
    l.includes("[gmail]/trash")
  );
}

function refsAllInTrash(refs: OrgThreadRef[]): boolean {
  const threads = refs.filter((r) => !isMailboxRef(r));
  return threads.length > 0 && threads.every((r) => isTrashLikeMailbox(r.mailbox ?? ""));
}

function isProposalApplicable(p: OrgProposal): boolean {
  return p.applicable !== false;
}

function batchActionLabel(p: OrgProposal): string {
  switch (p.suggestedAction) {
    case "trash":
      return "Tout mettre en corbeille";
    case "archive":
      return "Tout archiver";
    case "markRead":
      return "Tout marquer lu";
    case "retag":
      return "Normaliser les tags";
    case "move":
      return p.targetMailbox ? `Tout déplacer → ${p.targetMailbox}` : "Tout déplacer (lot)";
    case "deleteMailbox":
      return "Supprimer les dossiers vides";
    default:
      return "Appliquer au lot";
  }
}

/** Texte sous la carte : ce que fait le bouton principal. */
function batchActionHint(p: OrgProposal): string {
  switch (p.suggestedAction) {
    case "retag":
      return "Recalcule les tags kind:/state: de chaque fil listé selon son dossier IMAP (aucun déplacement de message).";
    case "archive":
      return "Déplace tous les fils listés vers le dossier d’archivage (structure selon vos préférences).";
    case "trash":
      return "Déplace tous les fils listés vers la corbeille IMAP (double confirmation).";
    case "markRead":
      return "Marque comme lus tous les fils listés, sans les déplacer.";
    case "move":
      return p.targetMailbox
        ? `Déplace tous les fils listés vers « ${p.targetMailbox} ».`
        : "Nécessite un dossier cible défini sur la carte.";
    case "deleteMailbox":
      return "Supprime les dossiers IMAP vides repérés (hors Inbox et corbeille).";
    default:
      return "";
  }
}

function batchActionHintLlmExtra(p: OrgProposal): string {
  if (p.source !== "llm") return "";
  if ((p.threadRefs?.length ?? 0) > 0) {
    return "Fils trouvés dans votre cache local à partir du catalogue et des mots-clés (facture, paiement, etc.).";
  }
  return "";
}

function resolveOrgActionLabel(
  p: OrgProposal,
  actionOverride?: OrgActionOverride | null,
): string {
  if (actionOverride === "trash") return "Mettre en corbeille";
  if (actionOverride === "archive") return "Archiver";
  if (actionOverride === "markRead") return "Marquer comme lu";
  return batchActionLabel(p).replace(/^Tout /, "");
}

function uniqueMailboxesFromRefs(refs: OrgThreadRef[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of refs) {
    const m = r.mailbox?.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/** Résumé lisible avant application d’une carte (confirmation utilisateur). */
export function formatOrgApplyImpact(
  p: OrgProposal,
  actionOverride?: OrgActionOverride | null,
): string {
  const isMailboxCard =
    p.suggestedAction === "deleteMailbox" ||
    (p.threadRefs[0] != null && isMailboxRef(p.threadRefs[0]));
  const countLabel = isMailboxCard ? `${p.totalCount} dossier(s)` : `${p.totalCount} fil(s)`;
  const lines = [`• ${countLabel}`, `• Action : ${resolveOrgActionLabel(p, actionOverride)}`];
  const mailboxes = uniqueMailboxesFromRefs(p.threadRefs);
  if (mailboxes.length === 1) {
    lines.push(`• Dossier : ${mailboxes[0]}`);
  } else if (mailboxes.length > 1 && mailboxes.length <= 4) {
    lines.push(`• Dossiers : ${mailboxes.join(", ")}`);
  } else if (mailboxes.length > 4) {
    lines.push(`• ${mailboxes.length} dossiers concernés`);
  }
  if (p.targetMailbox?.trim()) {
    lines.push(`• Destination : ${p.targetMailbox.trim()}`);
  }
  return lines.join("\n");
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

export function renderOrganizationView(
  state: OrganizationViewState,
  deps: OrgRenderDeps,
): string {
  const { escapeHtml, escapeAttr, iconSvg, renderThreadSample, mailboxLabel } = deps;

  const mailboxChip = (mb: string) =>
    `<button type="button" class="org-mailbox-chip" data-action="org-open-mailbox" data-mailbox="${escapeAttr(mb)}" title="Ouvrir le dossier">${escapeHtml(mailboxLabel(mb))}</button>`;

  const uniqueMailboxes = (refs: OrgThreadRef[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of refs) {
      const m = r.mailbox?.trim();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
    return out;
  };
  const report = state.report;
  const structureCards = report?.proposals.filter((p) => p.section === "structure") ?? [];
  const rangeCards = report?.proposals.filter((p) => p.section === "range") ?? [];
  const consolidateCards = report?.proposals.filter((p) => p.section === "consolidate") ?? [];

  const cardHtml = (cards: OrgProposal[]) =>
    cards.length === 0
      ? `<p class="dim org-empty">Aucune proposition dans cette section.</p>`
      : cards
          .map((p) => {
            const badge =
              p.kind === "transactionalNotification" || p.kind === "unsubscribeTransactional"
                ? `<span class="org-badge org-badge--transactional">Notif.</span>`
                : p.source === "llm"
                  ? `<span class="org-badge org-badge--llm">IA</span>`
                  : p.kind === "newsletterRuleUnfiled" ||
                      p.kind === "unsubscribeNewsletter" ||
                      p.kind === "bulkTrashCandidate"
                    ? `<span class="org-badge org-badge--newsletter">Mkt</span>`
                    : "";
            const threadSamples = dedupeThreadRefs(p.threadRefs);
            const mailboxSamples = (() => {
              const seen = new Set<string>();
              const out: OrgThreadRef[] = [];
              for (const r of p.threadRefs) {
                if (!isMailboxRef(r)) continue;
                const m = r.mailbox?.trim();
                if (!m || seen.has(m)) continue;
                seen.add(m);
                out.push(r);
              }
              return out;
            })();
            const rowSamples = [...threadSamples, ...mailboxSamples].slice(0, 12);
            const samplesHtml = rowSamples.map((r) => renderThreadSample(r, p)).join("");
            const mailboxes = uniqueMailboxes(p.threadRefs);
            const mailboxChipsHtml =
              mailboxes.length > 0
                ? `<div class="org-mailbox-chips">${mailboxes.map((mb) => mailboxChip(mb)).join("")}</div>`
                : "";
            const isTrash = p.suggestedAction === "trash";
            const isDeleteMailbox = p.suggestedAction === "deleteMailbox";
            const inTrashAlready = refsAllInTrash(p.threadRefs);
            const advisoryOnly = !isProposalApplicable(p);
            const countLabel =
              advisoryOnly || (p.threadRefs[0] && isMailboxRef(p.threadRefs[0]))
                ? `${p.totalCount} dossier(s)`
                : `${p.totalCount} fil(s)`;
            const listBlock = samplesHtml
              ? `<div class="inbox-thread-list org-proposal-thread-list" role="list">${samplesHtml}</div>`
              : `<p class="dim org-empty">Aucun échantillon affichable.</p>`;
            const explainHtml =
              p.explainSignals && p.explainSignals.length > 0
                ? `<p class="org-card__explain dim" title="${escapeHtml(p.explainRuleId ?? "")}">${escapeHtml(p.explainSignals.join(" · "))}</p>`
                : "";
            const actionHint = [batchActionHint(p), batchActionHintLlmExtra(p)].filter(Boolean).join(" ");
            const showAltTrash =
              isProposalApplicable(p) && p.suggestedAction !== "trash" && !inTrashAlready;
            const showAltArchive = isProposalApplicable(p) && p.suggestedAction !== "archive";
            const showPrimaryApply =
              isProposalApplicable(p) && !(isTrash && inTrashAlready);
            const rowHint =
              rowSamples.length > 0
                ? `<p class="dim org-sample-hint">Ligne : lire le fil ou le dossier · <strong>A</strong> : expéditeur auto · icônes : corbeille, archiver, resynchroniser ; sur un dossier vide : supprimer le dossier.</p>`
                : "";
            const applyingAttr = state.applying ? " disabled" : "";
            const altTrashBtn = showAltTrash
              ? `<button type="button" class="ghost-button" data-action="org-apply-trash" data-proposal-id="${escapeHtml(p.id)}"${applyingAttr}>Corbeille (lot)</button>`
              : "";
            const altArchiveBtn = showAltArchive
              ? `<button type="button" class="ghost-button" data-action="org-apply-archive" data-proposal-id="${escapeHtml(p.id)}"${applyingAttr}>Archiver (lot)</button>`
              : "";
            return `<article class="org-card" data-org-proposal-id="${escapeHtml(p.id)}">
              <header class="org-card__head">
                <h3 class="org-card__title">${escapeHtml(p.title)} ${badge}</h3>
                <span class="org-card__count">${countLabel}</span>
              </header>
              <p class="org-card__rationale">${escapeHtml(p.rationale)}</p>
              ${explainHtml}
              ${actionHint ? `<p class="org-action-hint dim">${escapeHtml(actionHint)}</p>` : ""}
              ${mailboxChipsHtml}
              ${rowHint}
              ${listBlock}
              <div class="org-card__actions org-card__actions--multi">
                ${altTrashBtn}
                ${altArchiveBtn}
                ${
                  advisoryOnly
                    ? `<p class="dim org-advisory-only">Conseil uniquement : trop de dossiers à la racine. Ouvrez chaque dossier via les puces ci-dessus et créez des sous-dossiers dans votre client mail, ou configurez l’archivage hiérarchique dans <strong>Paramètres → Général</strong>.</p>`
                    : showPrimaryApply
                      ? `<button type="button" class="primary-button" data-action="org-apply" data-proposal-id="${escapeHtml(p.id)}" data-trash="${isTrash ? "1" : "0"}" data-delete-mailbox="${isDeleteMailbox ? "1" : "0"}"${applyingAttr}>${state.applying ? "En cours…" : escapeHtml(batchActionLabel(p))}</button>`
                      : `<p class="dim org-advisory-only">Ces fils sont déjà dans la corbeille — aucune action supplémentaire.</p>`
                }
              </div>
            </article>`;
          })
          .join("");

  const structurePanel = (() => {
    if (!report?.mailboxStructure) return "";
    const st = report.mailboxStructure;
    const summary = st.summaryLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
    const rows = st.entries
      .slice(0, 80)
      .map((e) => {
        const indent = "—".repeat(Math.min(4, Math.max(0, e.depth)));
        const kind = e.isSystem ? '<span class="org-tree-tag">système</span>' : "";
        const empty = e.isEmpty ? '<span class="org-tree-tag org-tree-tag--empty">vide</span>' : "";
        return `<tr>
          <td class="org-tree-path"><span class="org-tree-indent">${indent}</span>${mailboxChip(e.mailbox)} ${kind} ${empty}</td>
          <td class="org-tree-num">${e.threadCount}</td>
          <td class="org-tree-num">${e.messageCount}</td>
        </tr>`;
      })
      .join("");
    const more =
      st.entries.length > 80
        ? `<p class="dim">… et ${st.entries.length - 80} autre(s) dossier(s).</p>`
        : "";
    return `<section class="org-section org-section--structure" aria-labelledby="org-structure-title">
      <h2 id="org-structure-title" class="org-section__title">Structure de la boîte</h2>
      <ul class="org-structure-summary">${summary}</ul>
      <div class="org-tree-wrap">
        <table class="org-tree-table">
          <thead><tr><th>Dossier</th><th>Fils</th><th>Messages</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${more}
      <div class="org-cards org-cards--nested">${cardHtml(structureCards)}</div>
    </section>`;
  })();

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

  const llmNotice = (() => {
    const llm = report?.llmStatus;
    if (!llm?.requested) return "";
    if (llm.succeeded && (llm.proposalCount ?? 0) > 0) {
      return `<p class="org-llm-notice org-llm-notice--ok">${escapeHtml(
        `${llm.proposalCount} proposition(s) IA ajoutée(s).`,
      )}</p>`;
    }
    if (llm.message?.trim()) {
      return `<p class="org-llm-notice org-llm-notice--warn" role="status">${escapeHtml(llm.message.trim())}</p>`;
    }
    return "";
  })();

  const trashModal = state.trashConfirmOpen
    ? `<div class="org-modal-backdrop" data-action="org-trash-cancel">
        <div class="org-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="org-trash-title">
          <h2 id="org-trash-title">Confirmer la corbeille</h2>
          ${trashImpactHtml}
          <p>Ces fils seront déplacés vers la corbeille IMAP. Cette action est réversible tant que la corbeille n’est pas vidée.</p>
          <p><label class="settings-form-check"><input type="checkbox" id="org-trash-check" /> Je comprends et souhaite continuer</label></p>
          <div class="org-modal__actions">
            <button type="button" class="ghost-button" data-action="org-trash-cancel">Annuler</button>
            <button type="button" class="primary-button" data-action="org-trash-confirm" disabled id="org-trash-confirm-btn">Mettre en corbeille</button>
          </div>
        </div>
      </div>`
    : "";

  const deleteMailboxModal = state.deleteMailboxConfirmOpen
    ? `<div class="org-modal-backdrop" data-action="org-delete-mailbox-cancel">
        <div class="org-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="org-delete-mailbox-title">
          <h2 id="org-delete-mailbox-title">Supprimer les dossiers vides ?</h2>
          ${deleteMbImpactHtml}
          <p>Les dossiers listés seront supprimés côté serveur IMAP s’ils sont vides (hors Inbox, corbeille, archives, brouillons, envoyés). Irréversible.</p>
          <p><label class="settings-form-check"><input type="checkbox" id="org-delete-mailbox-check" /> Je comprends et souhaite continuer</label></p>
          <div class="org-modal__actions">
            <button type="button" class="ghost-button" data-action="org-delete-mailbox-cancel">Annuler</button>
            <button type="button" class="primary-button" data-action="org-delete-mailbox-confirm" disabled id="org-delete-mailbox-confirm-btn">Supprimer</button>
          </div>
        </div>
      </div>`
    : "";

  return `<section class="thread-view organization-index" aria-label="Organiser">
    <header class="inbox-appbar organization-appbar">
      <div class="inbox-appbar-top">
        <div class="inbox-appbar-intro">
          ${navRenderTrailHtml("Organiser", escapeHtml, escapeAttr, { navClass: "secondary-view-nav" })}
          <h1 class="organization-title inbox-mailbox-title">${iconSvg("archive")}<span>Organiser</span></h1>
          <p class="dim organization-lead">Analysez votre compte, appliquez des actions par lots (archivage hiérarchique, consolidation, tags).</p>
        </div>
      </div>
      <div class="organization-toolbar">
        <button type="button" class="primary-button" data-action="org-scan" ${state.scanning ? "disabled" : ""}>
          ${state.scanning ? "Analyse…" : "Analyser le compte"}
        </button>
        ${report ? `<span class="dim"> ${report.stats.threadCount} fils · ${report.stats.mailboxCount} dossiers</span>` : ""}
      </div>
      ${state.applyMessage ? `<p class="org-apply-msg organization-apply-msg">${escapeHtml(state.applyMessage)}</p>` : ""}
      ${llmNotice}
    </header>
    <div class="inbox-panel surface organization-panel">
      ${
        report
          ? `<div class="organization-layout">
          <div class="organization-main">
            ${structurePanel}
            <section class="org-section" aria-labelledby="org-range-title">
              <h2 id="org-range-title" class="org-section__title">À ranger</h2>
              <div class="org-cards">${cardHtml(rangeCards)}</div>
            </section>
            <section class="org-section" aria-labelledby="org-consolidate-title">
              <h2 id="org-consolidate-title" class="org-section__title">Consolider</h2>
              <div class="org-cards">${cardHtml(consolidateCards)}</div>
              <p class="dim org-action-hint">Parcourt <strong>tous</strong> les fils du compte et recalcule les tags selon chaque dossier (plus long qu’une carte).</p>
              <button type="button" class="ghost-button" data-action="org-retag-all" ${state.applying ? "disabled" : ""}>${state.applying ? "Normalisation des tags…" : "Normaliser tous les tags du compte"}</button>
            </section>
          </div>
        </div>`
          : `<p class="dim org-hint organization-empty-hint">Cliquez sur Analyser pour générer des propositions.</p>`
      }
      ${trashModal}
      ${deleteMailboxModal}
    </div>
  </section>`;
}
