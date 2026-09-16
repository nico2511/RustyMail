import type { NavigateOpts } from "../types";

export type AppNavActionsDeps = {
  goBack: () => Promise<void>;
  navigateToInbox: (opts?: NavigateOpts) => void;
  navigateToBreadcrumbIndex: (stackIndex: number) => Promise<void>;
};

let appNavActionsDeps: AppNavActionsDeps | null = null;

export function registerAppNavActionsDeps(deps: AppNavActionsDeps): void {
  appNavActionsDeps = deps;
}

function navActionsDeps(): AppNavActionsDeps {
  if (!appNavActionsDeps) throw new Error("registerAppNavActionsDeps not called");
  return appNavActionsDeps;
}

export function goBack(): Promise<void> {
  return navActionsDeps().goBack();
}

export function navigateToInbox(opts?: NavigateOpts): void {
  navActionsDeps().navigateToInbox(opts);
}

export function navigateToBreadcrumbIndex(stackIndex: number): Promise<void> {
  return navActionsDeps().navigateToBreadcrumbIndex(stackIndex);
}
