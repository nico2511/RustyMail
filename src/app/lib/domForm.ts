export function inputValue(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() ?? "";
}

export function numberValue(id: string, fallback: number) {
  const value = Number.parseInt(inputValue(id), 10);
  return Number.isFinite(value) ? value : fallback;
}

export function selectValue(id: string, fallback: string) {
  return document.querySelector<HTMLSelectElement>(`#${id}`)?.value ?? fallback;
}

export function checkedValue(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false;
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}
