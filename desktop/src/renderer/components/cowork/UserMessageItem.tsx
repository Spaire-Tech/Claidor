import type { CoworkBrowserAnnotationMessageBatch } from '@shared/cowork/browserAnnotations';
import React, { useCallback, useMemo, useState } from 'react';

import { hasGoalSettingMessageMetadata } from '../../../common/goalCommandDisplay';
import {
  type CoworkImageAttachmentPreview,
  isBrowserAnnotationTransportImage,
} from '../../../shared/cowork/imageAttachments';
import type { CoworkSelectedTextSnippet } from '../../../shared/cowork/selectedText';
import { copyTextToClipboard } from '../../services/clipboard';
import { i18nService } from '../../services/i18n';
import type { CoworkImageAttachment, CoworkMessage, CoworkMessageMetadata } from '../../types/cowork';
import type { Skill } from '../../types/skill';
import { parseUserMessageForDisplay } from '../../utils/userMessageDisplay';
import { extractUserMessageFileAttachments } from '../../utils/userMessageFileAttachments';
import EditIcon from '../icons/EditIcon';
import GoalIcon from '../icons/GoalIcon';
import MessageCopyIcon from '../icons/MessageCopyIcon';
import SkillIcon from '../icons/SkillIcon';
import BrowserAnnotationAttachmentBadge from './BrowserAnnotationAttachmentBadge';
import BrowserAnnotationMessageAttachments, {
  type BrowserAnnotationAttachmentOpenPayload,
} from './BrowserAnnotationMessageAttachments';
import { reportConversationMessageAction } from './conversationAnalytics';
import ImagePreviewModal, { type ImagePreviewSource } from './ImagePreviewModal';
import {
  COWORK_DETAIL_CONTENT_CLASS,
  COWORK_DETAIL_GUTTER_CLASS,
} from './messageDisplayUtils';
import SelectedTextSnippetBadge from './SelectedTextSnippetBadge';
import UserMessageContent from './UserMessageContent';
import UserMessageFileAttachments from './UserMessageFileAttachments';

// ── The hover actions at the left of the bubble ─────────────────────────────

const HOVER_ACTION_CLASS_NAME =
  'inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#8f96a0] transition-colors hover:bg-[rgba(16,20,28,.05)] hover:text-[#1c1f23]';

const CopyButton: React.FC<{
  content: string;
  onCopy?: (result: 'success' | 'failed') => void;
  visible: boolean;
}> = ({ content, onCopy, visible }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const copiedToClipboard = await copyTextToClipboard(content);
    if (copiedToClipboard) {
      onCopy?.('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    onCopy?.('failed');
    window.electron?.log?.fromRenderer?.(
      'warn',
      'UserMessageItem',
      'Failed to copy user message content to the clipboard.',
    );
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={HOVER_ACTION_CLASS_NAME}
      tabIndex={visible ? 0 : -1}
      title={i18nService.t('copyToClipboard')}
      aria-label={i18nService.t('copyToClipboard')}
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-[#1f8a4c]"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ) : (
        <MessageCopyIcon className="h-4 w-4" />
      )}
    </button>
  );
};

const ReEditButton: React.FC<{
  visible: boolean;
  onClick: () => void;
}> = ({ visible, onClick }) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={HOVER_ACTION_CLASS_NAME}
      tabIndex={visible ? 0 : -1}
      title={i18nService.t('coworkReEdit')}
      aria-label={i18nService.t('coworkReEdit')}
    >
      <EditIcon className="h-4 w-4" />
    </button>
  );
};

// ── The chips inside the bubble ─────────────────────────────────────────────

const CAPABILITY_CHIP_CLASS_NAME =
  'inline-flex h-[30px] max-w-[240px] items-center gap-[7px] rounded-full border border-[rgba(16,22,35,.07)] bg-white px-[10px] text-[13px] tracking-[-.006em] text-[#0060d0]';

const UserMessageSkillBadges: React.FC<{ skills: Skill[] }> = ({ skills }) => {
  if (skills.length === 0) return null;

  return (
    <>
      {skills.map(skill => (
        <div
          key={skill.id}
          className={CAPABILITY_CHIP_CLASS_NAME}
          title={skill.description}
        >
          <SkillIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {skill.name}
          </span>
        </div>
      ))}
    </>
  );
};

const UserMessageCapabilityBadges: React.FC<{
  skills: Skill[];
}> = ({ skills }) => {
  if (skills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      <UserMessageSkillBadges skills={skills} />
    </div>
  );
};

// ── UserMessageItem ──────────────────────────────────────────────────────────

/**
 * The person's message (docs/maties/design.md, section 4): a pill-cornered
 * bubble on the right, attachments as chips above the text inside it, and
 * copy and edit at the left of the bubble on hover.
 */
const UserMessageItem: React.FC<{
  message: CoworkMessage;
  skills: Skill[];
  /** Session the message belongs to; used to resolve browser annotation screenshot assets. */
  sessionId?: string;
  onReEdit?: (message: CoworkMessage) => void;
  onLocateSelectedText?: (sourceMessageId: string) => void;
  /** Opens the annotation restore view in the artifact panel. */
  onOpenAnnotation?: (message: CoworkMessage, payload: BrowserAnnotationAttachmentOpenPayload) => void;
}> = React.memo(({ message, skills, sessionId, onReEdit, onLocateSelectedText, onOpenAnnotation }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ImagePreviewSource | null>(null);
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsHovered(false);
  }, []);
  const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (document.activeElement instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    setIsHovered(false);
  }, []);

  const metadata = message.metadata as CoworkMessageMetadata | undefined;
  const isGoalSettingMessage = hasGoalSettingMessageMetadata(metadata);
  const { text: displayContent, attachments: fileAttachments } = useMemo(
    () => extractUserMessageFileAttachments(parseUserMessageForDisplay(message.content || '', {
      localMediaAttachments: Array.isArray(metadata?.localMediaAttachments)
        ? metadata.localMediaAttachments
        : [],
    })),
    [message.content, metadata?.localMediaAttachments]
  );

  const messageSkillIds = Array.isArray(metadata?.skillIds) ? metadata.skillIds : [];
  const messageSkills = messageSkillIds
    .map(id => skills.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const selectedTextSnippets = (metadata?.selectedTextSnippets ?? []) as CoworkSelectedTextSnippet[];
  const browserAnnotations = (metadata?.browserAnnotations ?? []) as CoworkBrowserAnnotationMessageBatch[];
  const browserAnnotationCount = browserAnnotations.reduce(
    (total, batch) => total + batch.annotations.length,
    0,
  );
  const imageAttachmentPreviews = Array.isArray(metadata?.imageAttachmentPreviews)
    ? metadata.imageAttachmentPreviews as CoworkImageAttachmentPreview[]
    : [];
  const legacyImageAttachments = (metadata?.imageAttachments ?? []) as CoworkImageAttachment[];
  const allImageAttachments = imageAttachmentPreviews.length > 0
    ? imageAttachmentPreviews
    : legacyImageAttachments;
  // Annotation transport screenshots already render as numbered annotation
  // cards; keep them out of the regular attachment row.
  const displayImageAttachments = browserAnnotationCount > 0
    ? allImageAttachments.filter(image => !isBrowserAnnotationTransportImage(image))
    : allImageAttachments;
  const hasCapabilityBadges = messageSkills.length > 0;
  const hasText = Boolean(displayContent?.trim());
  const hasAttachmentsAboveText = browserAnnotationCount > 0
    || selectedTextSnippets.length > 0
    || hasCapabilityBadges
    || displayImageAttachments.length > 0
    || fileAttachments.length > 0;
  const handleImagePreviewOpen = useCallback((image: ImagePreviewSource) => {
    reportConversationMessageAction({
      actionType: 'open_message_image',
      message,
    });
    setExpandedImage(image);
  }, [message]);
  const handleReEditClick = useCallback(() => {
    reportConversationMessageAction({
      actionType: 'reedit_user_message',
      message,
    });
    onReEdit?.(message);
  }, [message, onReEdit]);
  const handleFileAttachmentReveal = useCallback(() => {
    reportConversationMessageAction({
      actionType: 'reveal_message_file',
      message,
    });
  }, [message]);
  const handleOpenAnnotationAttachment = useCallback((payload: BrowserAnnotationAttachmentOpenPayload) => {
    reportConversationMessageAction({
      actionType: 'open_message_annotation',
      message,
    });
    if (onOpenAnnotation) {
      onOpenAnnotation(message, payload);
      return;
    }
    setExpandedImage({ src: payload.src, name: payload.name });
  }, [message, onOpenAnnotation]);

  return (
    <div
      className={`py-2 ${COWORK_DETAIL_GUTTER_CLASS} focus:outline-none`}
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsHovered(true)}
      onBlur={handleBlur}
    >
      <div className={COWORK_DETAIL_CONTENT_CLASS}>
        <div className="flex w-full min-w-0 flex-row-reverse items-end gap-2">
          <div className="flex min-w-0 max-w-[72%] flex-col items-end gap-1">
            <div
              className="flex w-fit max-w-full flex-col gap-[10px] rounded-[18px] bg-[#f4f5f7] px-[18px] py-3 text-[14.5px] leading-[1.5] tracking-[-.008em] text-[#1c1f23]"
              style={{ textWrap: 'pretty' }}
            >
              {hasAttachmentsAboveText && (
                <div className="flex flex-col gap-[8px]">
                  {browserAnnotationCount > 0 && sessionId && (
                    <BrowserAnnotationMessageAttachments
                      draftKey={sessionId}
                      batches={browserAnnotations}
                      onOpen={handleOpenAnnotationAttachment}
                    />
                  )}
                  {browserAnnotationCount > 0 && (
                    <BrowserAnnotationAttachmentBadge
                      draftKey={sessionId ?? ''}
                      batches={browserAnnotations}
                      align="right"
                      onPreviewImage={setExpandedImage}
                      onOpenAnnotation={handleOpenAnnotationAttachment}
                      readOnly
                    />
                  )}
                  {selectedTextSnippets.length > 0 && (
                    <SelectedTextSnippetBadge
                      snippets={selectedTextSnippets}
                      align="right"
                      onLocate={onLocateSelectedText}
                    />
                  )}
                  {hasCapabilityBadges && (
                    <UserMessageCapabilityBadges skills={messageSkills} />
                  )}
                  {displayImageAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {displayImageAttachments.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="group relative overflow-hidden rounded-[12px] border border-[rgba(16,22,35,.07)] bg-white"
                          title={img.name}
                          aria-label={img.name}
                          onClick={() => handleImagePreviewOpen({
                            src: `data:${img.mimeType};base64,${img.base64Data}`,
                            alt: img.name,
                            name: img.name,
                          })}
                        >
                          <img
                            src={`data:${img.mimeType};base64,${img.base64Data}`}
                            alt={img.name}
                            className="block max-h-48 max-w-[16rem] object-contain"
                            draggable={false}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  {fileAttachments.length > 0 && (
                    <UserMessageFileAttachments
                      attachments={fileAttachments}
                      onReveal={handleFileAttachmentReveal}
                    />
                  )}
                </div>
              )}
              {hasText && (
                <div data-cowork-search-message-id={message.id}>
                  <UserMessageContent
                    content={displayContent}
                    className="max-w-none"
                    onImageClick={handleImagePreviewOpen}
                  />
                </div>
              )}
            </div>
            {isGoalSettingMessage && (
              <div className="inline-flex h-5 shrink-0 select-none items-center gap-1 text-[11.5px] leading-none text-[#a2a29c]">
                <GoalIcon className="h-4 w-4 text-[#9aa1ab]" />
                <span>{i18nService.t('coworkGoalSetAsGoal')}</span>
              </div>
            )}
          </div>
          <div
            className={`flex shrink-0 items-center gap-0.5 pb-[7px] transition-opacity duration-200 ${
              isHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            aria-hidden={!isHovered}
          >
            <CopyButton
              content={message.content}
              onCopy={(result) => reportConversationMessageAction({
                actionType: 'copy_message',
                message,
                params: {
                  result,
                  copySource: 'user_message',
                  copiedLength: message.content.length,
                },
              })}
              visible={isHovered}
            />
            {onReEdit && (
              <ReEditButton
                visible={isHovered}
                onClick={handleReEditClick}
              />
            )}
          </div>
        </div>
      </div>
      <ImagePreviewModal image={expandedImage} onClose={() => setExpandedImage(null)} />
    </div>
  );
});

export default UserMessageItem;
