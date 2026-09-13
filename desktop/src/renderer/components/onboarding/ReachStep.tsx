import React from 'react';

import { i18nService } from '../../services/i18n';
import ReachList from '../connections/ReachList';

/**
 * Screen 4, « How to reach {name} »: the title, then the reach list the
 * Apps tab shares (the assistant's address, the channels).
 */
export interface ReachStepProps {
  assistantName: string;
}

const ReachStep: React.FC<ReachStepProps> = ({ assistantName }) => (
  <div className="maties-ob-step flex w-full max-w-[760px] flex-col self-center">
    <h1 className="maties-headline text-center" style={{ fontSize: 'clamp(26px,3vw,36px)', letterSpacing: '-.016em' }}>
      {i18nService.t('matiesOnboardingReachTitle').replace('{name}', assistantName)}
    </h1>
    <div style={{ marginTop: 'clamp(24px,4vh,36px)' }}>
      <ReachList assistantName={assistantName} />
    </div>
  </div>
);

export default ReachStep;
