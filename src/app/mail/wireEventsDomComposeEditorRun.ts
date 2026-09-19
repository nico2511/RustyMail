// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomComposePreview } from "./wireEventsDomComposePreviewRun";
import {
  wireEventsDomComposeBodyTextarea,
  wireEventsDomComposeMarkdownToolbar,
} from "./wireEventsDomComposeBodyRun";
import { wireEventsDomComposeEditorFields } from "./wireEventsDomComposeEditorFieldsRun";

export function wireEventsDomComposeEditor(signal: AbortSignal): void {
  wireEventsDomComposePreview(signal);
  wireEventsDomComposeBodyTextarea(signal);
  wireEventsDomComposeEditorFields(signal);
  wireEventsDomComposeMarkdownToolbar(signal);
}
