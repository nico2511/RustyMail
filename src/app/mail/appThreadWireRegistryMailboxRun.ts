import { registerEmptyTrashMailboxDeps } from "./emptyTrashMailbox";
import {
  loadMailView,
  loadMailboxUnread,
} from "./mailListView";
import { registerMailboxManageActionDeps } from "./mailboxManageAction";
import { registerThreadListActionsDeps, sourceMailboxForThread } from "./threadListActions";
import { registerThreadScrollToMessageDeps } from "./threadScrollToMessage";
import { sortMessagesByReceivedDescending } from "./threadMessageSort";
import { registerSwitchMailboxRunDeps } from "./switchMailboxAction";

export function registerAppThreadWireMailboxDeps(): void {
  registerEmptyTrashMailboxDeps({
    loadMailView: () => loadMailView(),
    loadMailboxUnread,
  });

  registerThreadListActionsDeps({
    loadMailboxUnread,
  });

  registerMailboxManageActionDeps({
    loadMailboxUnread,
    loadMailView,
  });

  registerThreadScrollToMessageDeps({
    sortMessagesByReceivedDescending,
  });

  registerSwitchMailboxRunDeps({ loadMailView });
}
