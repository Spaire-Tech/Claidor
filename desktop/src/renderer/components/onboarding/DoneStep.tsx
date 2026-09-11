import React from 'react';

import { i18nService } from '../../services/i18n';
import Sphere from '../design/Sphere';

/**
 * Screen 6: the big sphere, « {name}, your personal Maty, is all set »
 * with the parrot inline as the founder drew it, and « Go to workspace ».
 */

const PARROT_SOURCE = './avatars/parrot.png';
const SPHERE_SIZE = 110;

export interface DoneStepProps {
  assistantName: string;
  finishing: boolean;
  onGoToWorkspace: () => void;
}

const DoneStep: React.FC<DoneStepProps> = ({ assistantName, finishing, onGoToWorkspace }) => {
  const sentence = i18nService.t('matiesOnboardingDoneSentence');
  const [before, after] = sentence.split('{name}');
  return (
    <div
      className="maties-ob-step flex w-full max-w-[760px] flex-1 flex-col items-center justify-center self-center text-center"
      style={{ minHeight: 'min(72vh,760px)', padding: 'clamp(20px,5vh,60px) 0' }}
    >
      <Sphere size={SPHERE_SIZE} title="Maties" />
      <h1
        className="maties-headline max-w-[26ch]"
        style={{ fontSize: 'clamp(34px,4.4vw,54px)', letterSpacing: '-.02em', lineHeight: 1.22, marginTop: 'clamp(34px,6vh,56px)', textWrap: 'pretty' }}
      >
        {before}
        {assistantName}
        {' '}
        <img
          src={PARROT_SOURCE}
          alt=""
          draggable={false}
          className="inline-block w-auto"
          style={{ height: '1.05em', verticalAlign: '-.16em', margin: '0 .06em' }}
        />
        {after}
      </h1>
      <button
        type="button"
        onClick={onGoToWorkspace}
        disabled={finishing}
        className="maties-ob-primary flex h-[46px] cursor-pointer items-center justify-center rounded-full border-0 px-[26px] text-[15px] font-medium"
        style={{ marginTop: 'clamp(34px,6vh,54px)' }}
      >
        {i18nService.t('matiesOnboardingGoToWorkspace')}
      </button>
    </div>
  );
};

export default DoneStep;
