import type { Account } from "../../accountSetup";

export type DiscoveredServersFormSnap = {
  imap: Account["imap"];
  smtp: Account["smtp"];
} | null;

let discoveredServersFormSnap: DiscoveredServersFormSnap = null;

export function getDiscoveredServersFormSnap(): DiscoveredServersFormSnap {
  return discoveredServersFormSnap;
}

export function setDiscoveredServersFormSnap(snap: DiscoveredServersFormSnap): void {
  discoveredServersFormSnap = snap;
}

export function clearDiscoveredServerSnap(): void {
  discoveredServersFormSnap = null;
}
