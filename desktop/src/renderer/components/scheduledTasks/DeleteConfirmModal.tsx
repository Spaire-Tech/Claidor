import React from 'react';
import { createPortal } from 'react-dom';

import { i18nService } from '../../services/i18n';
import Pill, { PillTone } from '../design/Pill';

interface DeleteConfirmModalProps {
  taskName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The approval shape from the chat (docs/maties/design.md, section 4): one
 * plain sentence, the exact thing in mono, then « Not now » and the verb.
 */
const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  taskName,
  onConfirm,
  onCancel,
}) => {
  const modal = (
    <div
      className="maties-backdrop fixed inset-0 z-[9999] flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="maties-card-prose maties-in w-full max-w-[400px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="maties-row-title text-[15.5px]">
          {i18nService.t('scheduledTasksDelete')}
        </h3>
        <p className="maties-row-desc">
          {i18nService.t('scheduledTasksDeleteConfirm').replace('{name}', taskName)}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Pill tone={PillTone.Ghost} compact onClick={onCancel}>
            {i18nService.t('matiesNotNow')}
          </Pill>
          <Pill tone={PillTone.Primary} compact onClick={onConfirm}>
            {i18nService.t('delete')}
          </Pill>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }

  return createPortal(modal, document.body);
};

export default DeleteConfirmModal;
