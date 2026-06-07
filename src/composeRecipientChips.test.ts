import { describe, expect, it } from "vitest";
import { mergeComposeRecipients } from "./composeRecipientChips";

describe("mergeComposeRecipients", () => {
  it("déduplique par email sans tenir compte de la casse", () => {
    const merged = mergeComposeRecipients(
      [{ email: "Alice@Example.com", name: "Alice" }],
      [{ email: "alice@example.com", name: null }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].email).toBe("Alice@Example.com");
  });

  it("ajoute plusieurs destinataires distincts", () => {
    const merged = mergeComposeRecipients(
      [{ email: "a@x.com" }],
      [{ email: "b@x.com" }, { email: "c@x.com" }]
    );
    expect(merged.map((r) => r.email)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });
});
