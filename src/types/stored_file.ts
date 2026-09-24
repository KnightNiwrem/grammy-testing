/**
 * Emulator-internal identity of a stored file.
 *
 * It is never a Bot API `file_id`: as on Telegram, each user identifies a file by a `file_id` of
 * its own, so Bot API projections resolve `file_id` for their observer instead.
 */
export type StoredFileId = string;

/** Telegram lets bots download files of at most this size with `getFile`. */
export const MAX_BOT_DOWNLOAD_FILE_BYTES = 20 * 1024 * 1024;

/** Image formats whose dimensions the emulator reads, which it accepts as photos. */
export type PhotoImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp';

/** A photo's image as it was sent, before it is stored. */
export interface PhotoUpload {
  readonly type: 'photo';
  readonly content: Uint8Array<ArrayBuffer>;
  readonly imageFormat: PhotoImageFormat;
  readonly width: number;
  readonly height: number;
}

/** A file sent as a document, before it is stored. */
export interface DocumentUpload {
  readonly type: 'document';
  readonly content: Uint8Array<ArrayBuffer>;
  /** The file name as Telegram shows it, which is never empty. */
  readonly fileName: string;
  /** The MIME type Telegram derives from the file name's extension. */
  readonly mimeType: string;
}

export type FileUpload = PhotoUpload | DocumentUpload;

interface StoredFileIdentity {
  readonly id: StoredFileId;
  /**
   * Telegram's `file_unique_id`, which, unlike `file_id`, is the same for every user and cannot be
   * used to send or download the file.
   */
  readonly uniqueId: string;
}

/**
 * A stored photo. Telegram converts a photo to JPEG and keeps it in several sizes; the emulator
 * keeps the one size and the format it was sent in.
 */
export type StoredPhotoFile = StoredFileIdentity & PhotoUpload;

export type StoredDocumentFile = StoredFileIdentity & DocumentUpload;

export type StoredFile = StoredPhotoFile | StoredDocumentFile;
