import React from 'react';

/**
 * The file marks the founder put in the design, shipped with the app
 * (public/file-icons). Anything else gets the plain document glyph.
 */
export const FileIconKind = {
  Word: 'word',
  Excel: 'excel',
  PowerPoint: 'powerpoint',
  Pdf: 'pdf',
  Mail: 'mail',
  SharePoint: 'sharepoint',
  Other: 'other',
} as const;
export type FileIconKind = typeof FileIconKind[keyof typeof FileIconKind];

const KIND_BY_EXTENSION: Record<string, FileIconKind> = {
  doc: FileIconKind.Word,
  docx: FileIconKind.Word,
  xls: FileIconKind.Excel,
  xlsx: FileIconKind.Excel,
  xlsm: FileIconKind.Excel,
  csv: FileIconKind.Excel,
  ppt: FileIconKind.PowerPoint,
  pptx: FileIconKind.PowerPoint,
  pdf: FileIconKind.Pdf,
  eml: FileIconKind.Mail,
  msg: FileIconKind.Mail,
};

const SOURCE_BY_KIND: Partial<Record<FileIconKind, string>> = {
  [FileIconKind.Word]: './file-icons/word.webp',
  [FileIconKind.Excel]: './file-icons/excel.webp',
  [FileIconKind.PowerPoint]: './file-icons/powerpoint.webp',
  [FileIconKind.Pdf]: './file-icons/pdf.webp',
  [FileIconKind.Mail]: './file-icons/mail.webp',
  [FileIconKind.SharePoint]: './file-icons/sharepoint.webp',
};

export const fileIconKindFor = (fileName: string): FileIconKind => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return KIND_BY_EXTENSION[extension] ?? FileIconKind.Other;
};

const FileIcon: React.FC<{ fileName: string; size?: number; className?: string }> = ({ fileName, size = 20, className }) => {
  const source = SOURCE_BY_KIND[fileIconKindFor(fileName)];
  if (!source) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8f96a0"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    );
  }
  return (
    <img
      src={source}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', flex: '0 0 auto' }}
    />
  );
};

export default FileIcon;
