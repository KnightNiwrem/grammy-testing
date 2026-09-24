import type { Context } from 'hono';

import type { StoredFile } from '../../types/stored_file.ts';

/**
 * Serves a stored file's content with its media type: a document's MIME type, or the format a
 * photo was sent in.
 */
export function fileDownloadResponse(context: Context, file: StoredFile): Response {
  const contentType = file.type === 'document' ? file.mimeType : `image/${file.imageFormat}`;
  return context.body(file.content, 200, { 'Content-Type': contentType });
}
