const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app container");

export const root: HTMLDivElement = appRoot;
