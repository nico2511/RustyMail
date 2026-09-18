import { LANG_GUESS_HINTS_DE } from "./threadLangGuessHintsDe";
import { LANG_GUESS_HINTS_EN } from "./threadLangGuessHintsEn";
import { LANG_GUESS_HINTS_ES } from "./threadLangGuessHintsEs";
import { LANG_GUESS_HINTS_FR } from "./threadLangGuessHintsFr";
import { LANG_GUESS_HINTS_IT } from "./threadLangGuessHintsIt";
import { LANG_GUESS_HINTS_PT } from "./threadLangGuessHintsPt";

export const LANG_GUESS_HINTS: Readonly<Record<string, readonly string[]>> = {
  fr: LANG_GUESS_HINTS_FR,
  en: LANG_GUESS_HINTS_EN,
  it: LANG_GUESS_HINTS_IT,
  de: LANG_GUESS_HINTS_DE,
  es: LANG_GUESS_HINTS_ES,
  pt: LANG_GUESS_HINTS_PT,
};
