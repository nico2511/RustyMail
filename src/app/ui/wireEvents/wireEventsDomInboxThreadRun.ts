// @ts-nocheck — DOM wiring; tighten types incrementally.
import type { Tone } from "../../types/appState";
import { toast } from "../../lib/toast";
import { threadIdsMatch } from "../../lib/threadIdsMatch";
import { openThread } from "../../mail/openThreadView";
import { onThreadMove, onThreadMoveTo } from "../../mail/threadListActions";
import {
  onOrgDeleteMailboxOne,
  onOrgSyncMailbox,
  onOrgV2IgnoreMailboxUi,
  onOrgV2UnignoreMailboxUi,
} from "../../mail/orgFolderWireActions";
import { onAttachmentAction, hydrateEmailHtml } from "../../mail/mailContentWireActions";
import { switchMailbox } from "../../mail/switchMailboxAction";
import { state } from "../../state";
import { render } from "../../dispatch";

export function wireEventsDomInboxThread(signal: AbortSignal): void {
  document.querySelectorAll<HTMLElement>("[data-toast]").forEach((element) => {
    element.addEventListener("click", () => toast(element.dataset.toast ?? "Not implemented yet"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mailbox]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.action?.trim()) return;
      void (async () => {
        await switchMailbox(el.dataset.mailbox || "INBOX");
      })();
    });
  });
  document.querySelectorAll<HTMLElement>(".thread-row-main[data-open-thread]").forEach((element) => {
    element.addEventListener("click", () => {
      const tid = element.dataset.threadId ?? "";
      const preserveAi = Boolean(
        state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid)
      );
      void openThread(tid, { preserveAi });
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".digest-open-thread[data-thread-id]").forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      void openThread(element.dataset.threadId ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=trash][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("trash", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=archive][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("archive", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-delete-mailbox-one"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        const refId = el.dataset.mailboxRefId?.trim();
        if (mb && refId) void onOrgDeleteMailboxOne(mb, refId);
      },
      { signal }
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-sync-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgSyncMailbox(mb);
      },
      { signal }
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-ignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgV2IgnoreMailboxUi(mb);
      },
      { signal }
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-unignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgV2UnignoreMailboxUi(mb);
      },
      { signal }
    );
  });
  document.querySelectorAll<HTMLSelectElement>("select.inbox-thread-folder-move").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const dest = el.value.trim();
      const tid = el.dataset.threadId ?? "";
      if (!dest || !tid) return;
      el.value = "";
      void onThreadMoveTo(tid, dest);
    });
  });
  document.querySelector<HTMLSelectElement>("#move-target-select")?.addEventListener("change", (event) => {
    state.moveTargetMailbox = (event.currentTarget as HTMLSelectElement).value || state.moveTargetMailbox;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-download][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onAttachmentAction("download", el.dataset.msgId ?? "", el.dataset.attDownload ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-open][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onAttachmentAction("open", el.dataset.msgId ?? "", el.dataset.attOpen ?? "", el.dataset.attName ?? "");
    });
  });
  if (state.view === "thread") {
    hydrateEmailHtml();
  }
  document.querySelectorAll(".modal-shell-stop-prop").forEach((shell) => {
    shell.addEventListener("click", (e) => e.stopPropagation());
  });
  const orgTrashCheck = document.querySelector<HTMLInputElement>("#org-trash-check");
  const orgTrashConfirm = document.querySelector<HTMLButtonElement>("#org-trash-confirm-btn");
  if (orgTrashCheck && orgTrashConfirm) {
    const syncTrashConfirm = () => {
      orgTrashConfirm.disabled = !orgTrashCheck.checked;
    };
    syncTrashConfirm();
    orgTrashCheck.addEventListener("change", syncTrashConfirm, { signal });
  }
  const orgDelMbCheck = document.querySelector<HTMLInputElement>("#org-delete-mailbox-check");
  const orgDelMbConfirm = document.querySelector<HTMLButtonElement>("#org-delete-mailbox-confirm-btn");
  if (orgDelMbCheck && orgDelMbConfirm) {
    const syncDelMbConfirm = () => {
      orgDelMbConfirm.disabled = !orgDelMbCheck.checked;
    };
    syncDelMbConfirm();
    orgDelMbCheck.addEventListener("change", syncDelMbConfirm, { signal });
  }
  const orgV2TrashCheck = document.querySelector<HTMLInputElement>("#org-v2-trash-check");
  const orgV2TrashConfirm = document.querySelector<HTMLButtonElement>("#org-v2-trash-confirm-btn");
  if (orgV2TrashCheck && orgV2TrashConfirm) {
    const syncV2Trash = () => {
      orgV2TrashConfirm.disabled = !orgV2TrashCheck.checked;
    };
    syncV2Trash();
    orgV2TrashCheck.addEventListener("change", syncV2Trash, { signal });
  }
  const orgV2DelMbCheck = document.querySelector<HTMLInputElement>("#org-v2-delete-mailbox-check");
  const orgV2DelMbConfirm = document.querySelector<HTMLButtonElement>("#org-v2-delete-mailbox-confirm-btn");
  if (orgV2DelMbCheck && orgV2DelMbConfirm) {
    const syncV2DelMb = () => {
      orgV2DelMbConfirm.disabled = !orgV2DelMbCheck.checked;
    };
    syncV2DelMb();
    orgV2DelMbCheck.addEventListener("change", syncV2DelMb, { signal });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tone = (button.dataset.tone as Tone) ?? state.tone;
      render();
    });
  });
}
