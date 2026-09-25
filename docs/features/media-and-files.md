# Media and files

[Feature index and comparison baseline](README.md) · [Message operations](messages.md)

## Supported behavior

Bots send photos and documents with `sendPhoto` and `sendDocument`. Files can be multipart uploads,
either in the part named for the parameter or referenced with `attach://<part-name>`, or an existing
`file_id` known to that bot. Accounts upload base64 content through the emulation API; the
TypeScript client accepts bytes and performs the encoding. Both sides can supply captions and
caption entities.

Photos expose dimensions, `has_media_spoiler` when requested and `show_caption_above_media` for a
caption above the photo. Documents expose their cleaned filename and a MIME type derived from its
extension, falling back to `application/octet-stream` for unknown extensions. Empty uploads fail.
Captions can be edited with `editMessageCaption` or the account client.

Each observer receives a different `file_id` for the same stored file. `file_unique_id` identifies
it across observers in that session. Reusing another bot's `file_id`, or sending a document ID as a
photo, fails. `getFile` returns a `file_path`; download the bytes at
`<botApiRoot>/file/bot<token>/<file_path>`. A path is available after `getFile` assigns it, and
remains valid for the session. Tests can bypass bot downloads with
`session.downloadFile(file_unique_id)`; that is an emulation API convenience, not a Telegram API.

## Photo and document processing differences

The emulator reads image headers for JPEG, PNG, GIF, WebP and BMP. It checks that width plus height
does not exceed 10,000 and that the aspect ratio does not exceed 20. Unrecognized image content
produces `IMAGE_PROCESS_FAILED`; rejected dimensions produce `PHOTO_INVALID_DIMENSIONS`.

It keeps the original bytes, format and one photo size. It does not fully decode the image,
recompress it to JPEG, generate thumbnails or produce multiple sizes. A header-valid but damaged
image may therefore pass. TDLib's [`Photo` implementation][photos] consumes server-provided sizes
and sends uploads to Telegram; the actual server image processor is outside these open-source
repositories. The comparison establishes the missing processing pipeline, not an exhaustive list of
formats or exact transformations Telegram will apply.

Documents always remain documents, including GIFs, audio and video uploads.
`disable_content_type_detection` is accepted but has no effect. Upstream chooses between document
file types based on that flag in [`get_input_message_content`][document-input], and
[`DocumentsManager`][documents] classifies returned media using its attributes. The emulator does
not inspect document content, generate previews, or reproduce that classification.

## Limits and missing file sources

| Concern                            | Emulator                                         | Upstream comparison                                                                            |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Bot downloads                      | Rejects files larger than 20 × 1024 × 1024 bytes | C++ server enforces this cap outside local mode; local mode bypasses it                        |
| Photo/document upload sizes        | No method-specific byte cap                      | Cloud API documents 10 MB photos and 50 MB documents; local mode permits uploads up to 2000 MB |
| HTTP URL file sources              | Rejected                                         | `get_input_file` and TDLib support remote sources                                              |
| Local filesystem paths / `file://` | Unsupported                                      | Official `--local` mode can use local paths                                                    |
| Thumbnails                         | Unsupported                                      | Official document input reads thumbnail uploads                                                |
| File identity and lifetime         | Random opaque IDs, held in memory per session    | No compatible TDLib file-ID encoding or durable Telegram identity                              |

Download limits are explicit in [`Client` file handling][download-limit]; upload/path handling is in
[`Client::get_input_file`][file-input]. The public [photo][send-photo] and [document][send-document]
method references document cloud upload ceilings, and the official
[local-mode description][local-mode] explains its relaxed limits. Passing a large upload to the
emulator does not test those ceilings.

A fresh upload always creates a fresh stored file and unique ID, even for identical bytes; only
reuse/forward/copy preserves the stored identity. File references never expire or require refresh
inside a session. Do not use this to test Telegram file-ID parsing, deduplication or long-lived
storage.

Other media types and `sendMediaGroup`/`editMessageMedia` are not implemented.

## Local evidence

[Media service](../../src/services/media_file.ts),
[image header reader](../../src/media/image_dimensions.ts),
[file repository](../../src/repositories/file.ts),
[media tests](../../tests/media_file_service_test.ts) and
[image tests](../../tests/image_dimensions_test.ts).

[photos]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/Photo.cpp#L45-L210
[document-input]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageContent.cpp#L5201-L5213
[documents]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DocumentsManager.cpp#L329-L605
[download-limit]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L9365-L9390
[file-input]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10758-L10839
[send-photo]: https://core.telegram.org/bots/api#sendphoto
[send-document]: https://core.telegram.org/bots/api#senddocument
[local-mode]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/README.md#usage
