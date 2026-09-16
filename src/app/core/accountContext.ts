import type { Account } from "../../accountSetup";
import { state } from "../state";

export function currentAccount(): Account | undefined {
  return state.accounts.find((a) => a.id === state.selectedAccountId) ?? state.accounts[0];
}
