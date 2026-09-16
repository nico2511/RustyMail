/** Runtime bridge: handlers in application.ts registered before wireEvents() runs. */
export type WireEventsBridge = Record<string, unknown>;

let bridge: WireEventsBridge = {};

export function registerWireEventsBridge(next: WireEventsBridge): void {
  bridge = { ...bridge, ...next };
}

/** Access bridged callables (typed loosely to avoid a 200-field manual type). */
export function app(): WireEventsBridge {
  return bridge;
}
