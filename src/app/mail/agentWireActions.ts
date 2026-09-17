export type AgentWireActionsDeps = {
  agentPrepareReplyStart: () => void | Promise<void>;
  agentPrepareReplyContinue: () => void | Promise<void>;
  stopAgentTelemetry: () => void | Promise<void>;
  agentInsertDraftIntoCompose: (extra?: string) => void | Promise<void>;
  agentRefreshPlanFromDraft: () => void | Promise<void>;
};

let agentWireActionsDeps: AgentWireActionsDeps | null = null;

export function registerAgentWireActionsDeps(deps: AgentWireActionsDeps): void {
  agentWireActionsDeps = deps;
}

function agentWire(): AgentWireActionsDeps {
  if (!agentWireActionsDeps) throw new Error("registerAgentWireActionsDeps not called");
  return agentWireActionsDeps;
}

export function agentPrepareReplyStart(): void | Promise<void> {
  return agentWire().agentPrepareReplyStart();
}

export function agentPrepareReplyContinue(): void | Promise<void> {
  return agentWire().agentPrepareReplyContinue();
}

export function stopAgentTelemetry(): void | Promise<void> {
  return agentWire().stopAgentTelemetry();
}

export function agentInsertDraftIntoCompose(extra?: string): void | Promise<void> {
  return agentWire().agentInsertDraftIntoCompose(extra);
}

export function agentRefreshPlanFromDraft(): void | Promise<void> {
  return agentWire().agentRefreshPlanFromDraft();
}
