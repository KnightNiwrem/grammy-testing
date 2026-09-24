import { getDocumentMimeType, getFileNameExtension } from '../media/document_file.ts';
import { readImageDimensions } from '../media/image_dimensions.ts';
import {
  type DocumentUpload,
  MAX_BOT_DOWNLOAD_FILE_BYTES,
  type PhotoImageFormat,
  type PhotoUpload,
  type StoredFile,
  type StoredFileId,
} from '../types/stored_file.ts';

/** Telegram rejects a photo whose width and height add up to more than this. */
const MAX_PHOTO_DIMENSION_SUM = 10_000;

/** Telegram rejects a photo whose longer side is more than this many times its shorter side. */
const MAX_PHOTO_ASPECT_RATIO = 20;

/** The directory of a bot's downloadable files of each type, as the Bot API server names it. */
const BOT_FILE_DIRECTORIES: Readonly<Record<StoredFile['type'], string>> = {
  photo: 'photos',
  document: 'documents',
};

const PHOTO_FILE_EXTENSIONS: Readonly<Record<PhotoImageFormat, string>> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  bmp: 'bmp',
};

export type PhotoUploadPreparation =
  | { readonly prepared: true; readonly upload: PhotoUpload }
  | {
    readonly prepared: false;
    readonly reason: 'file_empty' | 'image_invalid' | 'photo_dimensions_invalid';
  };

export type DocumentUploadPreparation =
  | { readonly prepared: true; readonly upload: DocumentUpload }
  | { readonly prepared: false; readonly reason: 'file_empty' };

/** A file a bot can download, with the path it downloads the file from. */
export interface BotDownloadableFile {
  readonly file: StoredFile;
  /** The observing bot's `file_id` of the file. */
  readonly fileId: string;
  readonly filePath: string;
}

export type GetBotFileResult =
  | { readonly found: true; readonly downloadableFile: BotDownloadableFile }
  | { readonly found: false; readonly reason: 'file_id_invalid' | 'file_too_big' };

interface FileStore {
  getFileByUniqueId(uniqueId: string): StoredFile | undefined;
  findObserverFile(observerId: number, observerFileId: string): StoredFile | undefined;
  getBotFilePath(botId: number, fileId: StoredFileId): string | undefined;
  countBotFilePaths(botId: number): number;
  addBotFilePath(botId: number, fileId: StoredFileId, filePath: string): void;
  findBotFileByPath(botId: number, filePath: string): StoredFile | undefined;
}

interface MediaFileServiceDependencies {
  readonly files: FileStore;
}

/**
 * Checks files that users send as photos or documents, resolves the `file_id` by which a user
 * reuses a file it has seen, and lets bots download files, as Telegram does.
 *
 * Messages store their uploads when they are sent; this service stores no file content itself.
 */
export class MediaFileService {
  readonly #files: FileStore;

  constructor({ files }: MediaFileServiceDependencies) {
    this.#files = files;
  }

  /**
   * Reads an uploaded image, which must be a JPEG, PNG, GIF, WebP, or BMP image, and checks its
   * dimensions as Telegram does for photos. Telegram also accepts other image formats, such as
   * TIFF, which the emulator does not read.
   */
  preparePhotoUpload(content: Uint8Array<ArrayBuffer>): PhotoUploadPreparation {
    if (content.length === 0) {
      return { prepared: false, reason: 'file_empty' };
    }
    const dimensions = readImageDimensions(content);
    if (dimensions === undefined) {
      return { prepared: false, reason: 'image_invalid' };
    }
    const { width, height } = dimensions;
    if (
      width + height > MAX_PHOTO_DIMENSION_SUM ||
      Math.max(width, height) > MAX_PHOTO_ASPECT_RATIO * Math.min(width, height)
    ) {
      return { prepared: false, reason: 'photo_dimensions_invalid' };
    }
    return { prepared: true, upload: { type: 'photo', content, ...dimensions } };
  }

  /**
   * Prepares an uploaded file to be sent as a document under the given nonempty name, whose
   * extension decides its MIME type.
   */
  prepareDocumentUpload(
    content: Uint8Array<ArrayBuffer>,
    fileName: string,
  ): DocumentUploadPreparation {
    if (content.length === 0) {
      return { prepared: false, reason: 'file_empty' };
    }
    return {
      prepared: true,
      upload: { type: 'document', content, fileName, mimeType: getDocumentMimeType(fileName) },
    };
  }

  /**
   * Finds the file a user knows by a `file_id`. As on Telegram, a `file_id` belongs to the user
   * that saw the file, so another user's `file_id` finds nothing.
   */
  findObserverFile(observerId: number, fileId: string): StoredFile | undefined {
    return this.#files.findObserverFile(observerId, fileId);
  }

  /**
   * Prepares a file the bot knows by its `file_id` for download, as `getFile` does, and returns
   * its `file_path`. A file keeps its path once it has one; as on Telegram, files larger than
   * 20 MB cannot be downloaded by bots.
   */
  getBotFile(botId: number, fileId: string): GetBotFileResult {
    const file = this.#files.findObserverFile(botId, fileId);
    if (file === undefined) {
      return { found: false, reason: 'file_id_invalid' };
    }
    if (file.content.length > MAX_BOT_DOWNLOAD_FILE_BYTES) {
      return { found: false, reason: 'file_too_big' };
    }

    let filePath = this.#files.getBotFilePath(botId, file.id);
    if (filePath === undefined) {
      filePath = this.#createBotFilePath(botId, file);
      this.#files.addBotFilePath(botId, file.id, filePath);
    }
    return { found: true, downloadableFile: { file, fileId, filePath } };
  }

  /** Finds the file a bot downloads from a `file_path` that `getFile` gave it. */
  findBotFileByPath(botId: number, filePath: string): StoredFile | undefined {
    return this.#files.findBotFileByPath(botId, filePath);
  }

  /** Finds a file by its `file_unique_id`, which is the same for every user. */
  findFileByUniqueId(uniqueId: string): StoredFile | undefined {
    return this.#files.getFileByUniqueId(uniqueId);
  }

  /**
   * Names a file as the Bot API server names the files it downloads for a bot: numbered in the
   * bot's directory for the file's type, with the extension of the file's format or name.
   */
  #createBotFilePath(botId: number, file: StoredFile): string {
    const extension = file.type === 'photo'
      ? PHOTO_FILE_EXTENSIONS[file.imageFormat]
      : getFileNameExtension(file.fileName);
    const fileName = `file_${this.#files.countBotFilePaths(botId)}`;
    return `${BOT_FILE_DIRECTORIES[file.type]}/${
      extension === undefined ? fileName : `${fileName}.${extension}`
    }`;
  }
}
