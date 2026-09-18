import { runSettingsDictationMicTest } from "./settingsDictationMicTestRun";

export async function tryHandleSettingsAiDictationWire(action: string): Promise<boolean> {
  if (action !== "dictation-test-mic") return false;
  void runSettingsDictationMicTest();
  return true;
}
