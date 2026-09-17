export type SwitchMailboxActionDeps = {
  switchMailbox: (nextMailbox: string) => Promise<void>;
};

let switchMailboxActionDeps: SwitchMailboxActionDeps | null = null;

export function registerSwitchMailboxActionDeps(deps: SwitchMailboxActionDeps): void {
  switchMailboxActionDeps = deps;
}

export function switchMailbox(nextMailbox: string): Promise<void> {
  if (!switchMailboxActionDeps) throw new Error("registerSwitchMailboxActionDeps not called");
  return switchMailboxActionDeps.switchMailbox(nextMailbox);
}
