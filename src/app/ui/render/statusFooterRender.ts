import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import {
  renderStatusBarProgressInlineHtml,
  type StatusBarProgressJob,
} from "../../../statusBarProgress";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { state } from "../../state";
import { gatherStatusBarProgressJobs } from "../../mail/statusBarProgressJobs";
import { renderDeps } from "./renderDeps";
import { renderStatusBarAiQuickTrigger } from "./aiQuickPanelRender";

function searchViewBatchJobStatusText(): string {
  const j = state.searchViewBatchJob;
  if (!j) return "";
  const target = j.target.trim() || "dossier";
  if (j.phase === "create") return `Création « ${target} »…`;
  return `Déplacement ${j.done}/${j.total} → ${target}…`;
}

function searchViewBatchActivityChipHtml(): string {
  const tip = searchViewBatchJobStatusText();
  if (!tip) return "";
  const short = tip.replace(/…+$/, "").trim();
  const label = short.length > 34 ? `${short.slice(0, 32)}…` : short;
  return `<span class="inbox-footer-chip inbox-footer-chip--busy inbox-footer-chip--affiner" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(label)}</span>`;
}

function organizationV2ActivityChipHtml(): string {
  if (!state.organizationV2.scanning && !state.organizationV2.applying) return "";
  const tip = (
    state.organizationV2.applyMessage ||
    (state.organizationV2.scanning ? "Analyse Organiser V2…" : "Application Organiser V2…")
  ).trim();
  const short = tip.replace(/…+$/, "").trim();
  const label = state.organizationV2.scanning
    ? "Organiser V2"
    : short.length > 34
      ? `${short.slice(0, 32)}…`
      : short || "Organiser V2";
  return `<span class="inbox-footer-chip inbox-footer-chip--busy inbox-footer-chip--org" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(label)}</span>`;
}

function organizationActivityChipHtml(): string {
  if (!state.organization.scanning && !state.organization.applying) return "";
  const tip = (
    state.organization.applyMessage ||
    (state.organization.scanning ? "Analyse de la boîte (structure, doublons, tags)…" : "Traitement organisation…")
  ).trim();
  let label = "Organiser";
  if (state.organization.scanning) {
    label = "Analyse compte";
  } else {
    const short = tip.replace(/…+$/, "").trim();
    label = short.length > 36 ? `${short.slice(0, 34)}…` : short;
  }
  return `<span class="inbox-footer-chip inbox-footer-chip--busy inbox-footer-chip--org" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(label)}</span>`;
}

export function renderStatusBarProgressInline(): string {
  const jobs = gatherStatusBarProgressJobs();
  return renderStatusBarProgressInlineHtml(jobs, escapeHtml, escapeAttr);
}

export function renderBackgroundActivityChips(opts: { digestSlot: boolean }): string {
  const d = renderDeps();
  const chips: string[] = [];
  const orgChip = organizationActivityChipHtml();
  if (orgChip) chips.push(orgChip);
  const orgV2Chip = organizationV2ActivityChipHtml();
  if (orgV2Chip) chips.push(orgV2Chip);
  const affinerChip = searchViewBatchActivityChipHtml();
  if (affinerChip) chips.push(affinerChip);
  if (state.syncInProgress) {
    const tip = (state.syncMessage || "Synchronisation IMAP en cours").trim();
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> IMAP</span>`,
    );
  }
  if (state.llmPrefetchPercent != null) {
    chips.push(
      `<span class="inbox-footer-chip" title="Téléchargement ou préparation du modèle LLM">LLM ${state.llmPrefetchPercent}%</span>`,
    );
  }
  if (state.idleAiCachePrefetchBusy) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="Préremplissage du cache IA (synthèses / traductions de fil) pendant une période calme"><span class="spinner spinner--tiny" aria-hidden="true"></span> Cache IA</span>`,
    );
  }
  if (opts.digestSlot && state.mailboxDigestRefreshing) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="Brief d’action du dossier en cours"><span class="spinner spinner--tiny" aria-hidden="true"></span> Brief</span>`,
    );
  }
  if (state.llmJobLabel) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(state.llmJobLabel)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(state.llmJobLabel)}</span>`,
    );
  }
  const nMsgTr = d.activeMessageTranslationJobCount();
  if (nMsgTr > 0) {
    const tip =
      nMsgTr === 1 ?
        "Traduction LLM d’un message en cours"
      : `${nMsgTr} traductions de messages en cours`;
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> Trad. msg${nMsgTr > 1 ? ` (${nMsgTr})` : ""}</span>`,
    );
  }
  const nSec = d.activeSecurityLlmAugmentCount();
  if (nSec > 0) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(
        nSec === 1 ? "Analyse sécurité IA (complément LLM) en cours" : `${nSec} analyses sécurité IA en cours`,
      )}"><span class="spinner spinner--tiny" aria-hidden="true"></span> Sécurité${nSec > 1 ? ` (${nSec})` : ""}</span>`,
    );
  }
  if (state.agentSession?.busy && !state.llmJobLabel) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="Assistant « Préparer une réponse » — transition"><span class="spinner spinner--tiny" aria-hidden="true"></span> Assistant</span>`,
    );
  }
  return chips.join("");
}

export function renderGlobalStatusFooter(): string {
  const st = state.status;
  const coreReady = isTauriRuntime() && Boolean(state.capabilities?.mailCore);
  const dotClass = coreReady ? "status-dot status-dot--ok" : "status-dot status-dot--idle";
  const modeLabel = isTauriRuntime() ? "Tauri" : "Navigateur";
  const coreLabel = !isTauriRuntime() ? "hors Tauri" : coreReady ? "cœur prêt" : "cœur off";
  const readLabel =
    !isTauriRuntime() ? "—" : state.capabilities?.readabilityModules ? "lisibilité OK" : "lisibilité off";
  const chips = renderBackgroundActivityChips({ digestSlot: true });
  const chipBlock = chips ? `<span class="status-bar-chip-group" role="status" aria-live="polite">${chips}</span>` : "";
  const acc = renderDeps().currentAccount();
  const email = acc?.email?.trim() ?? "";
  const accShort = email.length > 36 ? `${email.slice(0, 34)}…` : email;
  const accBlock = accShort
    ? `<span class="status-bar-account dim" title="${escapeAttr(email)}">${escapeHtml(accShort)}</span>`
    : `<span class="status-bar-account dim">Aucun compte</span>`;
  const composeAiQuick =
    state.view === "compose" ?
      `<div class="status-bar-compose-ai">${renderStatusBarAiQuickTrigger()}</div>`
    : "";
  const progressInline = renderStatusBarProgressInline();
  return `
    <footer class="status-bar-wrap">
      ${composeAiQuick}
      <footer class="status-bar">
        <span class="${dotClass}" title="${coreReady ? "Noyau mail prêt" : "Noyau mail indisponible ou navigateur"}"></span>
        <span class="status-bar-app">${escapeHtml(st?.appName ?? "RustyMail")} ${escapeHtml(st?.version ?? "0.1.1")}</span>
        <span class="status-bar-sep" aria-hidden="true">·</span>
        <span class="dim status-bar-compact">${escapeHtml(modeLabel)} · ${escapeHtml(coreLabel)} · ${escapeHtml(readLabel)}</span>
        ${progressInline}
        ${chipBlock}
        ${
          state.llmJobLabel
            ? `<button type="button" class="ghost-button status-bar-llm-cancel" data-action="llm-cancel-job" title="Annuler l’opération IA en cours">Annuler IA</button>`
            : ""
        }
        <span class="status-bar-spacer" aria-hidden="true"></span>
        ${accBlock}
      </footer>
    </footer>`;
}
