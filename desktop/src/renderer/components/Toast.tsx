import { XMarkIcon } from '@heroicons/react/24/outline';
import React from 'react';

/**
 * Payload accepted by the global `app:showToast` event. Plain strings remain
 * supported; pass an object to attach an action button (e.g. "Show in Folder"
 * after an export completes).
 */
export interface ToastEventDetail {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastProps {
  message: string;
  closeLabel: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

/**
 * A toast (docs/maties/design.md, section 6): bottom centre, radius 13,
 * blurred white, 13.5px, one line, one action at most.
 */
const Toast: React.FC<ToastProps> = ({ message, closeLabel, actionLabel, onAction, onClose }) => {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[10000] flex justify-center px-4">
      <div
        className="maties-toast maties-in pointer-events-auto flex w-fit max-w-[min(30rem,calc(100vw-2rem))] items-center gap-3 py-2 pl-4 pr-2"
        role="status"
        aria-live="polite"
      >
        <div className="min-w-0 flex-1 truncate leading-snug">
          {message}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={() => {
              onAction();
              onClose?.();
            }}
            className="maties-pill-sm is-link -my-0.5 shrink-0"
          >
            {actionLabel}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="maties-icon-button h-7 w-7 shrink-0"
            aria-label={closeLabel}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Toast;
