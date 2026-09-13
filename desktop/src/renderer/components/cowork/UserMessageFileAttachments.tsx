import React, { useCallback } from 'react';

import { ShellOpenFailureReason } from '../../../shared/shell/constants';
import { i18nService } from '../../services/i18n';
import type { UserMessageFileAttachment } from '../../utils/userMessageFileAttachments';
import FileIcon from '../design/FileIcon';
import { FolderLineIcon } from '../design/LineIcons';

const showToast = (message: string): void => {
  window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
};

interface UserMessageFileAttachmentsProps {
  attachments: UserMessageFileAttachment[];
  className?: string;
  onReveal?: (attachment: UserMessageFileAttachment) => void;
}

/**
 * The files the person sent, as small chips inside the bubble
 * (docs/maties/design.md, section 4). Clicking reveals the file in the
 * system file manager; a missing file says so in a toast.
 */
const UserMessageFileAttachments: React.FC<UserMessageFileAttachmentsProps> = ({
  attachments,
  className = '',
  onReveal,
}) => {
  const handleReveal = useCallback(async (attachment: UserMessageFileAttachment) => {
    onReveal?.(attachment);
    try {
      const result = await window.electron.shell.showItemInFolder(attachment.path);
      if (!result?.success) {
        showToast(i18nService.t(
          result?.reason === ShellOpenFailureReason.NotFound
            ? 'coworkFileAttachmentMissing'
            : 'coworkFileAttachmentRevealFailed',
        ));
      }
    } catch (error) {
      console.warn('[UserMessageFileAttachments] failed to reveal attachment path:', error);
      showToast(i18nService.t('coworkFileAttachmentRevealFailed'));
    }
  }, [onReveal]);

  if (attachments.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-[6px] ${className}`}>
      {attachments.map(attachment => (
        <button
          key={attachment.path}
          type="button"
          onClick={() => { void handleReveal(attachment); }}
          className="inline-flex h-[30px] max-w-[260px] items-center gap-[7px] rounded-full border border-[rgba(16,22,35,.07)] bg-white pl-[6px] pr-[11px] text-left text-[13px] tracking-[-.006em] text-[#31353b] transition-colors hover:border-[rgba(0,96,208,.35)] hover:text-[#0060d0]"
          title={`${attachment.path}\n${i18nService.t('coworkFileAttachmentRevealHint')}`}
          aria-label={`${attachment.name} — ${i18nService.t('coworkFileAttachmentRevealHint')}`}
        >
          {attachment.isDirectory ? (
            <FolderLineIcon size={16} className="text-[#4a4f57]" />
          ) : (
            <FileIcon fileName={attachment.name} size={18} />
          )}
          <span className="min-w-0 truncate">{attachment.name}</span>
        </button>
      ))}
    </div>
  );
};

export default UserMessageFileAttachments;
