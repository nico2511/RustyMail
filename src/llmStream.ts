import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const LLM_STREAM_CANCELLED = "llm_cancelled";

/** Job streamé en cours (pour `llm_stream_cancel` depuis la barre d’état). */
let activeStreamJobId: string | null = null;

export function cancelActiveLlmStreamJob(): void {
  const id = activeStreamJobId;
  if (id) void invoke("llm_stream_cancel", { jobId: id }).catch(() => {});
}

type StreamSummaryResult = {
  title: string;
  bullets: string[];
  sourceMessageIds?: string[];
};

type StreamTranslationResult = {
  translatedText: string;
};

export type LlmStreamCommand =
  | "llm_stream_summarize_thread"
  | "llm_stream_translate_thread"
  | "llm_stream_qa_thread"
  | "llm_stream_agent_prepare_draft";

export type LlmStreamDonePayload = {
  jobId: string;
  kind: string;
  summary?: StreamSummaryResult;
  translation?: StreamTranslationResult;
  qa?: { answer: string; evidenceMessageIds: string[] };
  displayText?: string;
  agentDraft?: { draft: string };
};

export type LlmStreamRunResult = LlmStreamDonePayload | "cancelled";

function newJobId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Exécute une commande LLM streamée : événements `llm-stream-*` + annulation via `AbortSignal`. */
export async function runLlmStreamJob(opts: {
  command: LlmStreamCommand;
  args: Record<string, unknown>;
  signal?: AbortSignal;
  onChunk: (accumulated: string) => void;
}): Promise<LlmStreamRunResult> {
  const jobId = newJobId();
  activeStreamJobId = jobId;
  let accumulated = "";
  type StreamErr = { message: string; cancelled: boolean };
  const streamState: {
    done: LlmStreamDonePayload | null;
    error: StreamErr | null;
  } = { done: null, error: null };
  const unlisteners: UnlistenFn[] = [];

  const unChunk = await listen<{ jobId: string; chunk: string }>("llm-stream-chunk", (e) => {
    if (e.payload.jobId !== jobId) return;
    accumulated += e.payload.chunk ?? "";
    opts.onChunk(accumulated);
  });
  unlisteners.push(unChunk);

  const unDone = await listen<LlmStreamDonePayload>("llm-stream-done", (e) => {
    if (e.payload.jobId !== jobId) return;
    streamState.done = e.payload;
  });
  unlisteners.push(unDone);

  const unErr = await listen<{ jobId: string; message: string; cancelled: boolean }>("llm-stream-error", (e) => {
    if (e.payload.jobId !== jobId) return;
    streamState.error = e.payload;
  });
  unlisteners.push(unErr);

  const onAbort = () => {
    void invoke("llm_stream_cancel", { jobId }).catch(() => {});
  };
  opts.signal?.addEventListener("abort", onAbort);

  try {
    await invoke(opts.command, { ...opts.args, jobId });
    if (streamState.error?.cancelled) return "cancelled";
    if (streamState.error?.message) throw new Error(streamState.error.message);
    if (!streamState.done) throw new Error("Flux LLM terminé sans résultat.");
    return streamState.done;
  } finally {
    if (activeStreamJobId === jobId) activeStreamJobId = null;
    opts.signal?.removeEventListener("abort", onAbort);
    for (const u of unlisteners) u();
  }
}

export function isLlmCancelledError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  return msg.includes(LLM_STREAM_CANCELLED) || /annul/i.test(msg);
}

/** Extrait la valeur partielle d’un champ string JSON (flux streamé type traduction). */
export function extractPartialJsonStringField(raw: string, field: string): string {
  const key = `"${field}"`;
  const start = raw.indexOf(key);
  if (start < 0) return "";
  let i = raw.indexOf(":", start + key.length);
  if (i < 0) return "";
  i += 1;
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1;
  if (raw[i] !== '"') return "";
  i += 1;
  let out = "";
  while (i < raw.length) {
    const c = raw[i]!;
    if (c === "\\" && i + 1 < raw.length) {
      const esc = raw[i + 1]!;
      if (esc === "n") out += "\n";
      else if (esc === "t") out += "\t";
      else if (esc === "r") out += "\r";
      else if (esc === '"') out += '"';
      else if (esc === "\\") out += "\\";
      else out += esc;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i += 1;
  }
  return out;
}
