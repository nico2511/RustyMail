import { describe, expect, it } from "vitest";
import {
  applyGrammarReplacement,
  countGrammarOccurrences,
  grammarOccurrenceCount,
  grammarOriginalTooLong,
  grammarSuggestionTooAmbiguous,
  replacementDropsCriticalPunct,
  replacementDropsWords,
  retainGrammarSuggestionsInText,
} from "./composeGrammarReplace";

const suggestion = (original: string, replacement: string, extra?: { offset?: number; length?: number }) => ({
  original,
  replacement,
  ...extra,
});

describe("applyGrammarReplacement", () => {
  it("remplace l’extrait exact du compose (capture Correction)", () => {
    const source = "salu moi c'est nicolas";
    const result = applyGrammarReplacement(
      source,
      suggestion(source, "Bonjour, je m'appelle Nicolas"),
    );
    expect(result.replaced).toBe(1);
    expect(result.occurrences).toBe(1);
    expect(result.text).toBe("Bonjour, je m'appelle Nicolas");
  });

  it("ne remplace que la première occurrence et les compte toutes", () => {
    const result = applyGrammarReplacement("aa et aa", suggestion("aa", "bb"));
    expect(result.text).toBe("bb et aa");
    expect(result.occurrences).toBe(2);
    expect(result.replaced).toBe(1);
  });

  it("colle le remplacement tel quel, y compris $&", () => {
    const result = applyGrammarReplacement("prix TOKEN fin", suggestion("TOKEN", "$&y"));
    expect(result.text).toBe("prix $&y fin");
  });

  it("accepte une apostrophe typographique ou un espace insécable", () => {
    const curly = applyGrammarReplacement(
      "salu moi c'est nicolas",
      suggestion("salu moi c\u2019est nicolas", "Bonjour, je m'appelle Nicolas"),
    );
    expect(curly.text).toBe("Bonjour, je m'appelle Nicolas");

    const nbsp = applyGrammarReplacement("salu\u00a0moi", suggestion("salu moi", "bonjour"));
    expect(nbsp.text).toBe("bonjour");
  });

  it("ignore les espaces en trop et les guillemets autour de l’extrait", () => {
    expect(applyGrammarReplacement("salu  moi", suggestion("salu moi", "bonjour")).text).toBe("bonjour");
    expect(
      applyGrammarReplacement("salu moi", suggestion('"salu moi"', "bonjour")).text,
    ).toBe("bonjour");
  });

  it("ne modifie pas le texte si l’extrait est absent", () => {
    const source = "salu moi c'est nicolas";
    const result = applyGrammarReplacement(source, suggestion("absent", "Bonjour"));
    expect(result.replaced).toBe(0);
    expect(result.text).toBe(source);
  });

  it("utilise offset/length seulement si la tranche correspond à l’extrait", () => {
    const hit = applyGrammarReplacement(
      "xxCDyy",
      suggestion("CD", "ok", { offset: 2, length: 2 }),
    );
    expect(hit.text).toBe("xxokyy");

    const miss = applyGrammarReplacement(
      "abcdef",
      suggestion("zzz", "ok", { offset: 0, length: 0 }),
    );
    expect(miss.text).toBe("abcdef");
    expect(miss.replaced).toBe(0);
  });

  it("repère une suppression de nom et garde une vraie correction", () => {
    expect(replacementDropsWords("Bonjour, je m'appelle Nicola.", "Bonjour, je m'appelle.")).toBe(true);
    expect(replacementDropsWords("Salu je mappel nicola", "Salut, je m'appelle Nicola")).toBe(false);
    expect(replacementDropsWords("salu moi c'est nicolas", "Bonjour, je m'appelle Nicolas")).toBe(false);
    expect(replacementDropsWords("aa", "bb")).toBe(false);
    expect(grammarOriginalTooLong("mot ".repeat(50))).toBe(true);
    expect(grammarOriginalTooLong("Salu je mappel nicola")).toBe(false);
    expect(replacementDropsCriticalPunct("Bonjour.", "Bonjour")).toBe(true);
    expect(replacementDropsCriticalPunct("Bonjour.", "Bonjour!")).toBe(false);
  });

  it("oublie une suggestion dont l’extrait n’est plus dans le corps", () => {
    const suggestions = [
      suggestion("Salu je mappel nicola", "Salut, je m'appelle Nicola"),
      suggestion("aa", "bb"),
    ];
    expect(retainGrammarSuggestionsInText(suggestions, "")).toEqual([]);
    expect(retainGrammarSuggestionsInText(suggestions, "aa reste")).toEqual([suggestions[1]]);
  });

  it("compte d’abord dans le texte affiché", () => {
    const g = suggestion("aa", "bb");
    expect(grammarOccurrenceCount("aa aa", "zz", g)).toBe(2);
    expect(grammarOccurrenceCount("rien", "aa aa", g)).toBe(2);
  });

  it("ne surligne pas chaque « a » dans plastique / mangé", () => {
    const source = "a mangé troi chosettes en plastik puis du plastique";
    expect(countGrammarOccurrences(source, suggestion("a", "à"))).toBe(1);
    expect(applyGrammarReplacement(source, suggestion("a", "à")).text).toBe(
      "à mangé troi chosettes en plastik puis du plastique",
    );
    expect(countGrammarOccurrences("plastique", suggestion("a", "à"))).toBe(0);
    expect(grammarSuggestionTooAmbiguous("a", "à")).toBe(true);
    expect(grammarSuggestionTooAmbiguous("plastik", "plastique")).toBe(false);
    expect(grammarSuggestionTooAmbiguous("a mange", "a mangé")).toBe(false);
  });
});
