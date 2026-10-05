/** Aligné sur `rustymail_infrastructure::demo_playground::DEMO_PLAYGROUND_ACCOUNT_ID`. */
export const DEMO_PLAYGROUND_ACCOUNT_ID = "playground@demo.rustymail.app";

export function isDemoPlaygroundAccountId(id: string | null | undefined): boolean {
  return String(id ?? "").trim() === DEMO_PLAYGROUND_ACCOUNT_ID;
}
