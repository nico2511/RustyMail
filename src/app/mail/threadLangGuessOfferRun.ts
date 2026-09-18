import type { CleanedMessageView, Tag } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { messagePlainSampleForLangGuess, normalizeIso639Primary } from "./threadLangGuessSamples";
import {
  guessIso6391FromMessageText,
  langFromKindTags,
  normalizeDetectedLangIso639,
} from "./threadLangGuessDetectRun";

export function shouldOfferPerMessageTranslate(
  message: CleanedMessageView,
  motherLangRaw: string,
  threadTags?: Tag[],
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = normalizeIso639Primary(motherLangRaw || "fr");

  const fromTags = langFromKindTags(message.tags) ?? (threadTags?.length ? langFromKindTags(threadTags) : null);
  if (fromTags && fromTags === mother) return false;

  const fromDb = normalizeDetectedLangIso639(message.detectedLang);
  if (fromDb) {
    return fromDb !== mother;
  }

  const plain = messagePlainSampleForLangGuess(message);
  if (plain.trim().length < 24) return false;

  const guess = guessIso6391FromMessageText(plain);
  if (guess === null) return false;
  return guess !== mother;
}

export function shouldOfferThreadTranslate(
  thread: { messages: CleanedMessageView[]; tags?: Tag[] },
  motherLangRaw: string,
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = motherLangRaw || "fr";
  return thread.messages.some((m) => shouldOfferPerMessageTranslate(m, mother, thread.tags));
}
