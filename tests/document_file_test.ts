import {
  cleanUploadedFileName,
  getDocumentMimeType,
  getFileNameExtension,
} from '../src/media/document_file.ts';

Deno.test('cleanUploadedFileName cleans names as the Bot API server does for documents', () => {
  const cases = [
    ['report.pdf', 'report.pdf'],
    ['Quarterly report (final).pdf', 'Quarterly report (final).pdf'],
    ['Отчёт 2026.xlsx', 'Отчёт 2026.xlsx'],
    ['folder/report.pdf', 'report.pdf'],
    ['a<b>:c?.txt', 'a b  c.txt'],
    ['  .hidden', 'hidden'],
    ['notes.', 'notes'],
    ['emoji 📄.txt', 'emoji.txt'],
    ['archive.tar.gz', 'archive.tar.gz'],
    [`${'x'.repeat(70)}.${'y'.repeat(20)}`, `${'x'.repeat(64)}.${'y'.repeat(16)}`],
    ['***', 'file'],
    ['', 'file'],
  ];

  for (const [fileName, expected] of cases) {
    const cleanedFileName = cleanUploadedFileName(fileName);
    if (cleanedFileName !== expected) {
      throw new Error(
        `Expected "${fileName}" to clean to "${expected}", received "${cleanedFileName}"`,
      );
    }
  }
});

Deno.test('getDocumentMimeType derives MIME types from extensions as TDLib does', () => {
  const cases = [
    ['report.pdf', 'application/pdf'],
    ['REPORT.PDF', 'application/pdf'],
    ['table.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['data.csv', 'text/csv'],
    ['photo.jpeg', 'image/jpeg'],
    ['archive.unknownext', 'application/octet-stream'],
    ['Makefile', 'application/octet-stream'],
    ['.pdf', 'application/octet-stream'],
  ];

  for (const [fileName, expected] of cases) {
    const mimeType = getDocumentMimeType(fileName);
    if (mimeType !== expected) {
      throw new Error(`Expected "${fileName}" to be ${expected}, received ${mimeType}`);
    }
  }
  if (getFileNameExtension('.bashrc') !== undefined || getFileNameExtension('a.b.c') !== 'c') {
    throw new Error('Expected only a dot after the first character to start the extension');
  }
});
