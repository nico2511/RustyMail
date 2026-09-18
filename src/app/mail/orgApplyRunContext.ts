export type OrgApplyRunDeps = {
  loadMailView: (append?: boolean) => Promise<void>;
};

let orgApplyRunDeps: OrgApplyRunDeps | null = null;

export function registerOrgApplyRunDeps(deps: OrgApplyRunDeps): void {
  orgApplyRunDeps = deps;
}

export function requireOrgApplyRunDeps(): OrgApplyRunDeps {
  if (!orgApplyRunDeps) throw new Error("registerOrgApplyRunDeps not called");
  return orgApplyRunDeps;
}
