export type SettingsWireActionsDeps = {
  syncActivityRecordingPrefs: () => void;
};

let settingsWireActionsDeps: SettingsWireActionsDeps | null = null;

export function registerSettingsWireActionsDeps(deps: SettingsWireActionsDeps): void {
  settingsWireActionsDeps = deps;
}

export function requireSettingsWireActionsDeps(): SettingsWireActionsDeps {
  if (!settingsWireActionsDeps) throw new Error("registerSettingsWireActionsDeps not called");
  return settingsWireActionsDeps;
}

export function syncActivityRecordingPrefs(): void {
  requireSettingsWireActionsDeps().syncActivityRecordingPrefs();
}
