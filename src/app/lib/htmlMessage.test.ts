// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  clearMailHtmlPayloads,
  mailHtmlContentFingerprint,
  mailHtmlMountAttrs,
  peekMailHtmlPayload,
} from "./htmlMessage";

describe("mailHtmlMountAttrs", () => {
  it("stocke le corps hors attribut et expose une empreinte", () => {
    clearMailHtmlPayloads();
    const html = `<p>${"x".repeat(4000)}</p>`;
    const attrs = mailHtmlMountAttrs("msg-1", html);
    expect(attrs).toContain('data-message-id="msg-1"');
    expect(attrs).toContain(`data-email-html-fp="${mailHtmlContentFingerprint(html)}"`);
    expect(attrs).not.toContain("data-email-html-b64");
    expect(peekMailHtmlPayload("msg-1")).toBe(html);
  });
});
