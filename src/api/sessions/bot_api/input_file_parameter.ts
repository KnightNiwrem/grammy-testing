import type { EmulationSession } from '../../../types/emulation_session.ts';
import type { BotApiUploadedFiles } from './request_parameters.ts';

type BotApiInputFile = Parameters<EmulationSession['botApi']['sendPhoto']>[1]['photo'];

/** The emulator's description for a file sent by URL, which Telegram downloads itself. */
export const FILE_URL_UNSUPPORTED_DESCRIPTION =
  'Bad Request: sending files by URL is not supported';

/** The prefix of a parameter value that names the multipart part carrying the file. */
const ATTACHED_FILE_PREFIX = 'attach://';

export type InputFileParameterReading =
  | { readonly read: true; readonly inputFile: BotApiInputFile }
  | { readonly read: false; readonly reason: 'file_missing' | 'url_unsupported' };

/**
 * Reads the file a method sends from its parameter, as the official Bot API server's
 * `get_input_file` does: `attach://<name>` names the uploaded part that carries the file, other
 * text is a `file_id` or an HTTP URL, and without the parameter the file is the uploaded part
 * named after the parameter.
 *
 * As TDLib does, text with a dot is taken for a URL, which `file_id` values never contain. Telegram
 * downloads a file from a URL itself; the emulator does not.
 */
export function readInputFileParameter(
  parameterName: string,
  value: string | undefined,
  uploadedFiles: BotApiUploadedFiles,
): InputFileParameterReading {
  if (value === undefined || value.length === 0 || value.startsWith(ATTACHED_FILE_PREFIX)) {
    const partName = value === undefined || value.length === 0
      ? parameterName
      : value.slice(ATTACHED_FILE_PREFIX.length);
    const uploadedFile = uploadedFiles.get(partName);
    return uploadedFile === undefined
      ? { read: false, reason: 'file_missing' }
      : { read: true, inputFile: { kind: 'upload', ...uploadedFile } };
  }
  return value.includes('.')
    ? { read: false, reason: 'url_unsupported' }
    : { read: true, inputFile: { kind: 'file_id', fileId: value } };
}

/** The parameters that name a document's thumbnail: the current name, then the legacy one. */
const THUMBNAIL_PARAMETER_NAMES = ['thumbnail', 'thumb'] as const;

/**
 * Finds the content of a thumbnail uploaded for a file, as the official Bot API server's
 * `get_input_thumbnail` does: from the part that `thumbnail` names with `attach://<name>`, or else
 * the part named `thumbnail`, and failing both, likewise for the legacy `thumb`. A thumbnail must
 * be uploaded, so other text, such as a `file_id` or URL, is ignored; without an uploaded part the
 * file is sent without a thumbnail.
 */
export function readThumbnailParameter(
  values: { readonly [Name in typeof THUMBNAIL_PARAMETER_NAMES[number]]?: string },
  uploadedFiles: BotApiUploadedFiles,
): Uint8Array<ArrayBuffer> | undefined {
  for (const parameterName of THUMBNAIL_PARAMETER_NAMES) {
    const value = values[parameterName];
    const partName = value?.startsWith(ATTACHED_FILE_PREFIX)
      ? value.slice(ATTACHED_FILE_PREFIX.length)
      : parameterName;
    const uploadedFile = uploadedFiles.get(partName);
    if (uploadedFile !== undefined) {
      return uploadedFile.content;
    }
  }
  return undefined;
}
