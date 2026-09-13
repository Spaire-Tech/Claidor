import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { DraftAttachment } from '../../store/slices/coworkSlice';
import FileIcon from '../design/FileIcon';
import { CloseLineIcon, FolderLineIcon } from '../design/LineIcons';
import ImagePreviewModal, { type ImagePreviewSource } from './ImagePreviewModal';

interface AttachmentCardProps {
  attachment: DraftAttachment;
  onRemove: (path: string) => void;
  label?: string;
}

/**
 * An attached file as the design draws it (docs/maties/design.md, section
 * 4): a chip above the text with the file's icon and an × on hover. An
 * image shows a small thumbnail in place of the icon and opens on click.
 */
export const ATTACHMENT_CHIP_CLASS_NAME =
  'group relative inline-flex h-8 max-w-[260px] items-center gap-[7px] rounded-full border border-[#e2e1de] bg-[#fbfbfa] pl-[7px] pr-[26px] text-[13.5px] tracking-[-.006em] text-[#31353b]';

const RemoveButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="absolute right-[6px] top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full text-[#a2a29c] opacity-0 transition-opacity hover:bg-[rgba(16,20,28,.06)] hover:text-[#1c1f23] focus-visible:opacity-100 group-hover:opacity-100"
    aria-label={i18nService.t('coworkAttachmentRemove')}
    title={i18nService.t('coworkAttachmentRemove')}
  >
    <CloseLineIcon size={10} />
  </button>
);

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment, onRemove, label }) => {
  if (attachment.isImage) {
    return <ImageChip attachment={attachment} onRemove={onRemove} label={label} />;
  }
  return <FileChip attachment={attachment} onRemove={onRemove} label={label} />;
};

const ImageChip: React.FC<AttachmentCardProps> = ({ attachment, onRemove, label }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(attachment.dataUrl ?? null);
  const [imgError, setImgError] = useState(false);
  const [preview, setPreview] = useState<ImagePreviewSource | null>(null);

  useEffect(() => {
    if (attachment.dataUrl) {
      setThumbUrl(attachment.dataUrl);
      return;
    }
    if (!attachment.path || attachment.path.startsWith('inline:')) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await window.electron.dialog.readFileAsDataUrl(attachment.path);
        if (!cancelled && result.success && result.dataUrl) {
          setThumbUrl(result.dataUrl);
        }
      } catch {
        // The chip falls back to the file icon.
      }
    })();
    return () => { cancelled = true; };
  }, [attachment.dataUrl, attachment.path]);

  const hasThumb = Boolean(thumbUrl) && !imgError;
  const displayName = label ? `${label} · ${attachment.name}` : attachment.name;

  return (
    <div className={ATTACHMENT_CHIP_CLASS_NAME} title={attachment.path}>
      {hasThumb ? (
        <button
          type="button"
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[6px]"
          onClick={() => setPreview({ src: thumbUrl!, name: attachment.name, alt: attachment.name })}
          aria-label={attachment.name}
        >
          <img
            src={thumbUrl!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            draggable={false}
          />
        </button>
      ) : (
        <FileIcon fileName={attachment.name} size={20} />
      )}
      <span className="min-w-0 truncate">{displayName}</span>
      <RemoveButton onClick={() => onRemove(attachment.path)} />
      <ImagePreviewModal image={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

const FileChip: React.FC<AttachmentCardProps> = ({ attachment, onRemove, label }) => {
  const displayName = label ? `${label} · ${attachment.name}` : attachment.name;
  return (
    <div className={ATTACHMENT_CHIP_CLASS_NAME} title={attachment.path}>
      {attachment.isDirectory ? (
        <FolderLineIcon size={18} className="text-[#4a4f57]" />
      ) : (
        <FileIcon fileName={attachment.name} size={20} />
      )}
      <span className="min-w-0 truncate">{displayName}</span>
      <RemoveButton onClick={() => onRemove(attachment.path)} />
    </div>
  );
};

export default AttachmentCard;
