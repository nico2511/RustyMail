import { app } from "../wireEventsBridge";

/** Invoke a handler still registered on registerWireEventsBridge(). */
export function callApp(name: string, ...args: unknown[]): unknown {
  const fn = app()[name];
  if (typeof fn !== "function") {
    throw new Error(`wireEvents bridge missing: ${name}`);
  }
  return (fn as (...a: unknown[]) => unknown)(...args);
}
