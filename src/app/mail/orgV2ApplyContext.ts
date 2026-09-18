export type OrgV2ApplyRunDeps = {
  loadMailView: (append?: boolean) => Promise<void>;
};

let orgV2ApplyRunDepsImpl: OrgV2ApplyRunDeps | null = null;

export function registerOrgV2ApplyRunDeps(deps: OrgV2ApplyRunDeps): void {
  orgV2ApplyRunDepsImpl = deps;
}

export function orgV2ApplyRunDeps(): OrgV2ApplyRunDeps {
  if (!orgV2ApplyRunDepsImpl) throw new Error("registerOrgV2ApplyRunDeps not called");
  return orgV2ApplyRunDepsImpl;
}
