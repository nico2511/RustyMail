import type { ThreadListItem } from "../types";

export type DigestBenchMessage = {
  id: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  html: string;
};

export type DigestBenchCompare = "split" | "raw" | "cut";

export type DigestBenchModel = {
  queryDraft: string;
  threads: ThreadListItem[];
  searchError: string;
  searching: boolean;
  selectedThreadId: string | null;
  threadSubject: string;
  messages: DigestBenchMessage[];
  selectedMessageId: string | null;
  sampleMessageId: string | null;
  validationMessageId: string | null;
  yaml: string;
  yamlReady: boolean;
  previewApplicable: boolean | null;
  previewHtml: string;
  previewError: string;
  previewing: boolean;
  compareMode: DigestBenchCompare;
  accepted: boolean;
  acceptedFixtureId: string | null;
  readingEnabled: boolean;
  readingFixtureId: string | null;
  notice: string;
};

export const digestBench: DigestBenchModel = {
  queryDraft: "@deblock.com",
  threads: [],
  searchError: "",
  searching: false,
  selectedThreadId: null,
  threadSubject: "",
  messages: [],
  selectedMessageId: null,
  sampleMessageId: null,
  validationMessageId: null,
  yaml: "",
  yamlReady: false,
  previewApplicable: null,
  previewHtml: "",
  previewError: "",
  previewing: false,
  compareMode: "split",
  accepted: false,
  acceptedFixtureId: null,
  readingEnabled: false,
  readingFixtureId: null,
  notice: "",
};

export function captureDigestBenchDom(): void {
  const query = document.querySelector<HTMLInputElement>("#digest-bench-query");
  const yaml = document.querySelector<HTMLTextAreaElement>("#digest-bench-yaml");
  if (query) digestBench.queryDraft = query.value;
  if (yaml) digestBench.yaml = yaml.value;
}
