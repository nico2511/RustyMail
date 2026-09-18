import { isVirtualMailbox } from "../../mailboxKinds";

export type MailboxManageActionDeps = {
  loadMailboxUnread: () => Promise<void>;
  loadMailView: (append?: boolean) => Promise<void>;
};

let mailboxManageDeps: MailboxManageActionDeps | null = null;

export function registerMailboxManageActionDeps(deps: MailboxManageActionDeps): void {
  mailboxManageDeps = deps;
}

export function requireMailboxManageActionDeps(): MailboxManageActionDeps {
  if (!mailboxManageDeps) throw new Error("registerMailboxManageActionDeps not called");
  return mailboxManageDeps;
}

export function mailboxPathPrefixForCreate(selectedMailbox: string | undefined): string {
  const m = (selectedMailbox ?? "").trim();
  if (!m || isVirtualMailbox(m)) return "";
  return m.endsWith("/") ? m : `${m}/`;
}
