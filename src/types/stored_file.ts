/**
 * Emulator-internal identity of a stored file.
 *
 * It is never a Bot API `file_id`: as on Telegram, each user identifies a file by a `file_id` of
 * its own, so Bot API projections resolve `file_id` for their observer instead.
 */
export type StoredFileId = string;

/** Telegram lets bots download files of at most this size with `getFile`. */
export const MAX_BOT_DOWNLOAD_FILE_BYTES = 20 * 1024 * 1024;

/** TDLib refuses to upload a larger file as a photo, for bots and user accounts alike. */
export const MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;

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

/** TDLib ignores a larger thumbnail that a sender uploads with a file. */
export const MAX_THUMBNAIL_UPLOAD_BYTES = 200 * 1024 - 1;

/**
 * A preview image that a sender uploaded with a document, as it was sent. Telegram asks for a JPEG
 * of at most 320 pixels a side; the emulator keeps any image whose dimensions it reads unchanged.
 */
export interface ThumbnailUpload {
  readonly type: 'thumbnail';
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
  /** Omitted for a document sent without a usable thumbnail. */
  readonly thumbnail?: ThumbnailUpload;
}

/** A file a user sends as a message's media; a thumbnail is uploaded only with its document. */
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

/** A stored thumbnail, which users know by a `file_id` of its own, as any file. */
export type StoredThumbnailFile = StoredFileIdentity & ThumbnailUpload;

export type StoredDocumentFile =
  & StoredFileIdentity
  & Omit<DocumentUpload, 'thumbnail'>
  & {
    /** Omitted for a document without a thumbnail. */
    readonly thumbnail?: StoredThumbnailFile;
  };

export type StoredFile = StoredPhotoFile | StoredDocumentFile | StoredThumbnailFile;
