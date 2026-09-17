let accountsFormIdentityScratch: { displayName: string; email: string } | undefined;

export function getAccountsFormIdentityScratch(): { displayName: string; email: string } | undefined {
  return accountsFormIdentityScratch;
}

export function resetAccountsFormIdentityScratch(): void {
  accountsFormIdentityScratch = undefined;
}

export function captureAccountsFormIdentityFromDom(skipCapture: boolean): void {
  accountsFormIdentityScratch = undefined;
  if (skipCapture) return;
  const mailInput = document.querySelector<HTMLInputElement>("#account-email");
  if (!mailInput) return;
  accountsFormIdentityScratch = {
    email: mailInput.value ?? "",
    displayName: document.querySelector<HTMLInputElement>("#account-display-name")?.value ?? "",
  };
}
