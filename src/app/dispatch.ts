/** Rendu global : enregistré par `render/views.ts` pour éviter les imports circulaires. */
let renderImpl: (() => void) | undefined;

export function registerRender(fn: () => void): void {
  renderImpl = fn;
}

export function render(): void {
  renderImpl?.();
}
