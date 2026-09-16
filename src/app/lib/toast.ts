const MAX_TOAST_STACK = 8;

const DEFAULT_TOAST_DURATION_MS = 7200;

export function toast(message: string, durationMs: number = DEFAULT_TOAST_DURATION_MS) {
  let box = document.querySelector<HTMLDivElement>("#toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.className = "toast-box";
    document.body.appendChild(box);
  }
  while (box.children.length >= MAX_TOAST_STACK) {
    box.firstElementChild?.remove();
  }
  const element = document.createElement("div");
  element.className = "toast surface-elevated";
  element.textContent = message;
  box.appendChild(element);
  window.setTimeout(() => element.remove(), durationMs);
}
