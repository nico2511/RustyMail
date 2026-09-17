import { state } from "../state";

export function clearThreadAiSummaryState(): void {
  state.aiOutput = "";
  state.aiThreadScope = null;
  state.quickReplySuggestions = [];
  state.agentSession = null;
  state.threadQaAnswer = null;
  state.threadQaStreamText = "";
}
