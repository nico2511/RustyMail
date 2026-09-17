import type { NavigateOpts } from "../types";
import {
  goBack as goBackImpl,
  navigateToBreadcrumbIndex as navigateToBreadcrumbIndexImpl,
  navigateToInbox as navigateToInboxImpl,
} from "./appNavigationStack";

export function goBack(): Promise<void> {
  return goBackImpl();
}

export function navigateToInbox(opts?: NavigateOpts): void {
  navigateToInboxImpl(opts);
}

export function navigateToBreadcrumbIndex(stackIndex: number): Promise<void> {
  return navigateToBreadcrumbIndexImpl(stackIndex);
}
