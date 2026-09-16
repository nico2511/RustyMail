import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_INVOKE_TIMEOUT_MS } from "../core/timeouts";

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Tauri command timeout")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function tauriErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function safeInvoke<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: T,
  timeoutMs: number = DEFAULT_INVOKE_TIMEOUT_MS,
): Promise<T> {
  try {
    return await withTimeout(invoke<T>(command, args), timeoutMs);
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    return fallback;
  }
}
