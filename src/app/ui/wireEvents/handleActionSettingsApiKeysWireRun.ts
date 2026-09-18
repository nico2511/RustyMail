import {
  clearCloudApiKeys,
  clearDictationApiKey,
  clearLlamaServerApiKey,
  clearOpenrouterApiKey,
  saveCloudApiKeysFromDom,
  saveDictationApiKeyFromDom,
  saveLlamaServerApiKeyFromDom,
  saveOpenrouterApiKeyFromDom,
} from "../../mail/settingsApiKeysPersistRun";

export async function tryHandleSettingsApiKeysWire(action: string): Promise<boolean> {
  switch (action) {
    case "save-cloud-api-key":
      void saveCloudApiKeysFromDom();
      return true;
    case "clear-cloud-api-key":
      void clearCloudApiKeys();
      return true;
    case "save-dictation-api-key":
      void saveDictationApiKeyFromDom();
      return true;
    case "clear-dictation-api-key":
      void clearDictationApiKey();
      return true;
    case "save-openrouter-api-key":
      void saveOpenrouterApiKeyFromDom();
      return true;
    case "clear-openrouter-api-key":
      void clearOpenrouterApiKey();
      return true;
    case "save-llama-server-api-key":
      void saveLlamaServerApiKeyFromDom();
      return true;
    case "clear-llama-server-api-key":
      void clearLlamaServerApiKey();
      return true;
    default:
      return false;
  }
}
