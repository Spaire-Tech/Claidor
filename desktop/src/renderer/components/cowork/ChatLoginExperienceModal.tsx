import React from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import Pill, { PillTone } from '../design/Pill';
import Sphere from '../design/Sphere';

interface ChatLoginExperienceModalProps {
  loginPending: boolean;
  onClose: () => void;
  onStart: () => void;
}

/**
 * The chat's sign-in prompt (docs/maties/design.md, section 6): the sphere
 * at 64px, the sentence, one blue pill, the small print in 12.5px.
 */
const ChatLoginExperienceModal: React.FC<ChatLoginExperienceModalProps> = ({
  loginPending,
  onClose,
  onStart,
}) => {
  return (
    <Modal
      onClose={onClose}
      onEscape={onClose}
      overlayClassName="non-draggable maties-backdrop fixed inset-0 z-[10050] flex items-center justify-center px-4"
      className="maties-card-prose maties-in relative w-full max-w-[440px] px-8 py-10 text-center"
    >
      <div className="flex flex-col items-center">
        <Sphere size={64} title="Maties" />
        <h2 className="maties-headline mt-6 text-[24px]">
          {i18nService.t('matiesChatLoginSentence')}
        </h2>
        <Pill
          tone={PillTone.Primary}
          className="mt-7 px-6"
          onClick={onStart}
          disabled={loginPending}
        >
          {i18nService.t(loginPending ? 'matiesChatLoginOpening' : 'matiesSignInWithClaidor')}
        </Pill>
        <p className="maties-caption mt-5 max-w-[40ch]">
          {i18nService.t('matiesAccountSignedOutDesc')}
        </p>
      </div>
    </Modal>
  );
};

export default ChatLoginExperienceModal;
