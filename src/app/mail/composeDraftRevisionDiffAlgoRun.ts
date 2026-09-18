import type { DraftDiffLine } from "../types";

export function splitDraftDiffLines(input: string): string[] {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

export function myersDiffDraftLines(a: string[], b: string[]): DraftDiffLine[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  let v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;
      const down = k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1]);
      let x = down ? v[kIndex + 1] : v[kIndex - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[kIndex] = x;
      if (x >= n && y >= m) {
        const out: DraftDiffLine[] = [];
        let curX = n;
        let curY = m;
        for (let curD = d; curD >= 0; curD--) {
          const prevV = trace[curD];
          const curK = curX - curY;
          const curKIndex = curK + offset;
          const prevDown =
            curK === -curD || (curK !== curD && prevV[curKIndex - 1] < prevV[curKIndex + 1]);
          const prevK = prevDown ? curK + 1 : curK - 1;
          const prevX = prevDown ? prevV[prevK + offset] : prevV[prevK + offset] + 1;
          const prevY = prevX - prevK;
          while (curX > prevX && curY > prevY) {
            out.push({ kind: "eq", text: a[curX - 1] });
            curX--;
            curY--;
          }
          if (curD === 0) break;
          if (prevDown) {
            out.push({ kind: "add", text: b[curY - 1] });
            curY--;
          } else {
            out.push({ kind: "del", text: a[curX - 1] });
            curX--;
          }
        }
        out.reverse();
        return out;
      }
    }
  }
  return [
    ...a.map((t) => ({ kind: "del" as const, text: t })),
    ...b.map((t) => ({ kind: "add" as const, text: t })),
  ];
}
