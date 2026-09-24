import type { EmulationSession } from '../../../types/emulation_session.ts';
import type { BotApiUploadedFiles } from './request_parameters.ts';

type BotApiInputFile = Parameters<EmulationSession['botApi']['sendPhoto']>[1]['photo'];

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
