import { z } from 'zod';

import { jsonParameter } from './request_parameters.ts';

/**
 * A `LinkPreviewOptions` object.
 *
 * The emulator does not detect links or generate link previews, so it validates the options and
 * otherwise ignores them, and messages never carry `link_preview_options`.
 */
export const linkPreviewOptionsSchema = z.strictObject({
  is_disabled: z.boolean().optional(),
  url: z.string().optional(),
  prefer_small_media: z.boolean().optional(),
  prefer_large_media: z.boolean().optional(),
  show_above_text: z.boolean().optional(),
});

/** A `link_preview_options` parameter: a JSON `LinkPreviewOptions` object. */
export function linkPreviewOptionsParameter() {
  return jsonParameter(linkPreviewOptionsSchema);
}
