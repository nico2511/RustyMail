import { render } from "../dispatch";
import { state } from "../state";
import { mailboxManageAction } from "./mailboxManageAction";

export async function tryHandleListThreadMailboxWire(action: string): Promise<boolean> {
  switch (action) {
    case "open-mailbox-manage":
      state.mailboxManageOpen = true;
      render();
      return true;
    case "close-mailbox-manage":
      state.mailboxManageOpen = false;
      render();
      return true;
    case "mb-create":
      await mailboxManageAction("create");
      return true;
    case "mb-rename":
      await mailboxManageAction("rename");
      return true;
    case "mb-delete":
      await mailboxManageAction("delete");
      return true;
    case "mb-subscribe":
      await mailboxManageAction("subscribe");
      return true;
    default:
      return false;
  }
}
