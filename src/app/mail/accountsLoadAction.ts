export type LoadAccountsFromBackendOptions = {
  silent?: boolean;
  timeoutMs?: number;
};

export type AccountsLoadActionDeps = {
  loadAccountsFromBackend: (options?: LoadAccountsFromBackendOptions) => Promise<boolean>;
};

let accountsLoadActionDeps: AccountsLoadActionDeps | null = null;

export function registerAccountsLoadActionDeps(deps: AccountsLoadActionDeps): void {
  accountsLoadActionDeps = deps;
}

export function loadAccountsFromBackend(options?: LoadAccountsFromBackendOptions): Promise<boolean> {
  if (!accountsLoadActionDeps) throw new Error("registerAccountsLoadActionDeps not called");
  return accountsLoadActionDeps.loadAccountsFromBackend(options);
}
