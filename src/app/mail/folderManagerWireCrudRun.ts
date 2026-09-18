import { render } from "../dispatch";
import {
  fmCreateMailbox,
  fmSelectMailbox,
  fmSyncMailbox,
  refreshFolderManagerTree,
} from "./orgFolderWireActions";

export function tryHandleFolderManagerCrudWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "fm-refresh":
      void refreshFolderManagerTree();
      return true;
    case "fm-create-root":
      void fmCreateMailbox();
      return true;
    case "fm-create-child": {
      const parent = element?.dataset.mailbox?.trim();
      if (parent) void fmCreateMailbox(parent);
      return true;
    }
    case "fm-select": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void fmSelectMailbox(mb);
      return true;
    }
    case "fm-sync": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void fmSyncMailbox(mb);
      return true;
    }
    default:
      return false;
  }
}
