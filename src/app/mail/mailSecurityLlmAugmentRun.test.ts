// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvers: Array<(v: unknown) => void> = [];
const invokedIds: string[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((_cmd: string, args: { payload: { context: { messageId?: string } } }) => {
    invokedIds.push(String(args?.payload?.context?.messageId ?? ""));
    return new Promise((res) => resolvers.push(res));
  }),
}));
vi.mock("../dispatch", () => ({ render: vi.fn() }));

const msg = (id: string) =>
  ({ messageId: id, mailSecurity: { severity: "attention", summaryFr: "", findings: [] } }) as never;

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("file LLM sécurité", () => {
  beforeEach(() => {
    resolvers.length = 0;
    invokedIds.length = 0;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  it("traite le nouveau fil après une annulation pendant un invoke en cours", async () => {
    const { state } = await import("../state");
    (state.appPrefs.ai as unknown as Record<string, unknown>).featureSecurityLlmEnabled = true;
    const mod = await import("./mailSecurityLlmAugmentRun");

    mod.scheduleSecurityLlmAugment(msg("q-A"));
    await flush();
    expect(resolvers).toHaveLength(1);

    // L’utilisateur quitte le fil pendant l’analyse et ouvre un autre fil.
    mod.cancelPendingSecurityLlmAugments();
    mod.scheduleSecurityLlmAugment(msg("q-B"));
    expect(mod.isSecurityLlmAugmentPending("q-B")).toBe(true);

    resolvers[0]!({ severity: "ok", summaryFr: "", findings: [] });
    await flush();
    // B a obtenu son propre appel LLM.
    expect(resolvers).toHaveLength(2);

    resolvers[1]!({ severity: "attention", summaryFr: "", findings: [] });
    await flush();
    expect(mod.isSecurityLlmAugmentPending("q-B")).toBe(false);
    expect(mod.securityLlmAugmentStateForMessage("q-B").cached).toBe(true);
    expect(mod.activeSecurityLlmAugmentCount()).toBe(0);
  });
});
