export type CloseComposeModal =
  | null
  | {
      subject: string;
      hasSavedRecord: boolean;
    };

export type OrphanDraftSessionItem = {
  sessionId: string;
  updatedAt: string;
  revisionCount: number;
  title: string;
  preview: string;
};

export type ResumeDraftModal =
  | null
  | {
      sessions: OrphanDraftSessionItem[];
    };

export type TextPromptModalSpec = {
  title: string;
  body?: string;
  label: string;
  defaultValue: string;
};

export type ConfirmModalSpec = {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
};

export type NavigateOpts = {
  resetStack?: boolean;
  skipHistory?: boolean;
  replaceHistory?: boolean;
};

export type OAuthDesktopLoginOutcome = {
  email: string;
  displayName?: string | null;
  redirectUri?: string;
  ephemeralRedirect?: boolean;
};
