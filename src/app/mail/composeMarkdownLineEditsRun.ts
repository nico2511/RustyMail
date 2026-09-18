export function markdownExpandSelectedLines(textarea: HTMLTextAreaElement) {
  const value = textarea.value;
  const selA = textarea.selectionStart ?? 0;
  const selB = textarea.selectionEnd ?? 0;
  const lo = Math.min(selA, selB);
  const hi = Math.max(selA, selB);
  const ls = value.lastIndexOf("\n", lo - 1) + 1;
  let le = value.indexOf("\n", hi);
  if (le === -1) le = value.length;
  return { value, ls, le };
}

export function markdownToggleBulletLines(textarea: HTMLTextAreaElement, prefix = "- ") {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    if (allPrefixed && line.startsWith(prefix)) return line.slice(prefix.length);
    return `${prefix}${line}`;
  });
  const replacement = nextLines.join("\n");
  textarea.setRangeText(replacement, ls, le, "end");
}

export function markdownToggleNumberedLines(textarea: HTMLTextAreaElement) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || /^\s*\d+\.\s/.test(line));
  const nextLines =
    lines.length && allPrefixed
      ? lines.map((line) => (line.trim() === "" ? line : line.replace(/^\s*\d+\.\s*/, "").trimStart()))
      : lines.map((line, idx) =>
          line.trim() === ""
            ? line
            : `${idx + 1}. ${line.replace(/^\s*\d+\.\s*/, "").trimStart()}`,
        );
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

export function markdownToggleBlockquoteLines(textarea: HTMLTextAreaElement) {
  markdownToggleBulletLines(textarea, "> ");
}

export function markdownToggleHeadingLines(textarea: HTMLTextAreaElement, level: 1 | 2 | 3 = 2) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const prefix = `${"#".repeat(level)} `;
  const stripRe = /^(#{1,6})\s+/;
  const allAreSameHeading = lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    const noHeading = line.replace(stripRe, "");
    return allAreSameHeading ? noHeading : `${prefix}${noHeading}`;
  });
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

export function markdownInsertCodeOrFence(textarea: HTMLTextAreaElement, start: number, end: number, selected: string) {
  if (selected && selected.includes("\n")) {
    const replacement = `\`\`\`\n${selected}\n\`\`\``;
    textarea.setRangeText(replacement, start, end, "end");
  } else {
    wrapSelection(textarea, start, end, "`", "`", selected || "code", { selectInnerWhenEmpty: true });
  }
}

export function wrapSelection(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  fallbackText: string,
  options?: { selectInnerWhenEmpty?: boolean },
) {
  const selected = textarea.value.slice(start, end);
  const inner = selected || fallbackText;
  const replacement = `${prefix}${inner}${suffix}`;
  textarea.setRangeText(replacement, start, end, "end");
  if (!selected && options?.selectInnerWhenEmpty) {
    const innerStart = start + prefix.length;
    const innerEnd = innerStart + inner.length;
    textarea.setSelectionRange(innerStart, innerEnd);
  }
  textarea.focus();
}
