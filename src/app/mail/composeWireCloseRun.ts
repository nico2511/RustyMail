import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import { clearDraftSession, discardCurrentDraftSession, leaveComposeViewAfterClose } from "./composeCloseFlow";
import { saveDraftToSavedListNow } from "./composeDraftLocalSave";

export async function closeComposeWithoutSavingFromWire(): Promise<void> {
  state.closeComposeModal = null;
  render();
  await discardCurrentDraftSession();
  await leaveComposeViewAfterClose();
}

export async function saveAndCloseComposeFromWire(): Promise<void> {
  state.closeComposeModal = null;
  render();
  const ok = await saveDraftToSavedListNow({ silentToast: true });
  if (ok) {
    toast("Conservé dans « Sauvés », compositeur fermé.");
    clearDraftSession();
    await leaveComposeViewAfterClose();
  }
}
