import { DEFAULT_ASSISTANT_NAME, OnboardingStoreKey } from '@shared/onboarding/constants';
import React, { useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { ConnectionsCatalog, ReachList } from '../connections';
import PageTitle from '../design/PageTitle';
import Pill, { PillTone } from '../design/Pill';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarMcpIcon from '../icons/SidebarMcpIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import SkillIcon from '../icons/SkillIcon';
import { McpManager } from '../mcp';
import { reportMcpAction } from '../mcp/analytics';
import { SkillsManager } from '../skills';
import { reportSkillAction } from '../skills/analytics';
import {
  SKILLS_CONNECTORS_SECTION_LABEL_KEYS,
  SKILLS_CONNECTORS_SECTION_ORDER,
  SkillsConnectorsSection,
} from './sections';

interface SkillsAndConnectorsViewProps {
  activeSection: SkillsConnectorsSection;
  onSectionChange: (section: SkillsConnectorsSection) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  onCreateSkillByChat?: () => void;
  onUseSkill?: (skillId: string) => void;
  updateBadge?: React.ReactNode;
  skillsReadOnly?: boolean;
}

const SECTION_ICONS: Record<SkillsConnectorsSection, React.FC<{ className?: string }>> = {
  [SkillsConnectorsSection.Skills]: SkillIcon,
  [SkillsConnectorsSection.Connectors]: SidebarMcpIcon,
};

/** The assistant's name as the onboarding stored it; the default until then. */
const useAssistantName = (): string => {
  const [name, setName] = useState(DEFAULT_ASSISTANT_NAME);
  useEffect(() => {
    let active = true;
    window.electron.store.get(OnboardingStoreKey.AssistantName)
      .then((stored: unknown) => {
        if (active && typeof stored === 'string' && stored.trim()) setName(stored.trim());
      })
      .catch((error: unknown) => {
        console.warn('[Connections] Could not read the assistant name', error);
      });
    return () => { active = false; };
  }, []);
  return name;
};

/**
 * The Connectors section (docs/maties/onboarding.md, « In the workspace »):
 * how to reach the assistant, the catalogue, then the person's own servers.
 */
const ConnectorsSection: React.FC = () => {
  const assistantName = useAssistantName();
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-[14px]">
        <h2 className="text-[24px] font-medium tracking-[-.014em] text-[#1c1f23]">
          {i18nService.t('matiesConnectionsReachTitle').replace('{name}', assistantName)}
        </h2>
        <ReachList assistantName={assistantName} />
      </section>
      <ConnectionsCatalog />
      <section className="flex flex-col gap-[14px]">
        <h2 className="text-[24px] font-medium tracking-[-.014em] text-[#1c1f23]">
          {i18nService.t('matiesConnectionsOwnServers')}
        </h2>
        <McpManager />
      </section>
    </div>
  );
};

/**
 * Skills & Connectors (docs/maties/design.md, section 6): one page, one
 * title, the two sections as pills at the top right.
 */
const SkillsAndConnectorsView: React.FC<SkillsAndConnectorsViewProps> = ({
  activeSection,
  onSectionChange,
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  onCreateSkillByChat,
  onUseSkill,
  updateBadge,
  skillsReadOnly,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Each section has its own content height; keep the switch landing at the top.
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  const handleSectionSelect = (section: SkillsConnectorsSection) => {
    if (section === activeSection) return;
    const report = section === SkillsConnectorsSection.Connectors ? reportMcpAction : reportSkillAction;
    report('section_change', {
      source: 'skills_connectors_view',
      fromSection: activeSection,
      targetSection: section,
    });
    onSectionChange(section);
  };

  return (
    <div
      data-skin-management-page="true"
      className="relative z-10 flex h-full flex-1 flex-col bg-background"
    >
      <div className="draggable flex h-[54px] shrink-0 items-center px-4">
        {isSidebarCollapsed && !isWindows && (
          <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={i18nService.t('expand')}
              className="maties-icon-button"
            >
              <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
            </button>
            <button
              type="button"
              onClick={onNewChat}
              aria-label={i18nService.t('newChat')}
              className="maties-icon-button"
            >
              <ComposeIcon className="h-4 w-4" />
            </button>
            {updateBadge}
          </div>
        )}
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1120px]">
          <PageTitle
            title={i18nService.t('skillsAndConnectors')}
            description={i18nService.t('skillsAndConnectorsSubtitle')}
            action={(
              <div
                role="tablist"
                aria-label={i18nService.t('skillsAndConnectors')}
                className="non-draggable flex items-center gap-1.5"
              >
                {SKILLS_CONNECTORS_SECTION_ORDER.map((section) => {
                  const isActive = activeSection === section;
                  const Icon = SECTION_ICONS[section];
                  return (
                    <Pill
                      key={section}
                      role="tab"
                      compact
                      aria-selected={isActive}
                      tone={isActive ? PillTone.Selected : PillTone.Quiet}
                      icon={<Icon className="h-[15px] w-[15px]" />}
                      onClick={() => handleSectionSelect(section)}
                    >
                      {i18nService.t(SKILLS_CONNECTORS_SECTION_LABEL_KEYS[section])}
                    </Pill>
                  );
                })}
              </div>
            )}
          />
          <div className="px-9 pb-8 pt-6">
            {activeSection === SkillsConnectorsSection.Connectors ? (
              <ConnectorsSection />
            ) : (
              <SkillsManager
                readOnly={skillsReadOnly}
                onCreateByChat={onCreateSkillByChat}
                onUseSkill={onUseSkill}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsAndConnectorsView;
