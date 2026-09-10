import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../../services/logReporter';
import { RootState } from '../../store';
import { CoworkSessionStatusValue, type CoworkSessionSummary } from '../../types/cowork';
import { getAgentDisplayNameById } from '../../utils/agentDisplay';
import { formatAgentTaskRelativeTime } from '../agentSidebar/time';
import Modal from '../common/Modal';
import SkinPresentationScope from '../skin/SkinPresentationScope';

const SEARCH_SESSION_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 180;
const TASK_SEARCH_ANALYTICS_SOURCE = 'home_task_search';

const getSessionAgentId = (session: CoworkSessionSummary) => {
  return session.agentId?.trim() || AgentId.Main;
};

const getSessionAgentType = (session: CoworkSessionSummary): 'main' | 'custom' => (
  getSessionAgentId(session) === AgentId.Main ? 'main' : 'custom'
);

const reportTaskSearchAction = (
  actionType: string,
  options: {
    agentType?: 'main' | 'custom';
    hasQuery?: boolean;
    isCurrentSession?: boolean;
    resultCount?: number;
    sessionStatus?: string;
  } = {},
): void => {
  console.debug('[CoworkSearch] reporting task search analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.TaskSearchAction,
    source: TASK_SEARCH_ANALYTICS_SOURCE,
    actionType,
    hasQuery: options.hasQuery,
    resultCount: options.resultCount,
    isCurrentSession: options.isCurrentSession,
    sessionStatus: options.sessionStatus,
    agentType: options.agentType,
  });
};

const mergeUniqueSessions = (
  primary: CoworkSessionSummary[],
  secondary: CoworkSessionSummary[],
): CoworkSessionSummary[] => {
  const seen = new Set<string>();
  const result: CoworkSessionSummary[] = [];
  [...primary, ...secondary].forEach((session) => {
    if (seen.has(session.id)) return;
    seen.add(session.id);
    result.push(session);
  });
  return result;
};

const renderHighlightedTitle = (title: string, query: string): React.ReactNode => {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return title;
  const matchIndex = title.toLowerCase().indexOf(trimmedQuery);
  if (matchIndex === -1) return title;
  return (
    <>
      {title.slice(0, matchIndex)}
      <span className="rounded-[3px] bg-[rgba(0,96,208,.12)] text-[#1c1f23] dark:text-[#f2f3f5]">
        {title.slice(matchIndex, matchIndex + trimmedQuery.length)}
      </span>
      {title.slice(matchIndex + trimmedQuery.length)}
    </>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="maties-kbd inline-flex min-w-[18px] items-center justify-center">
    {children}
  </kbd>
);

interface CoworkSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: CoworkSessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (session: CoworkSessionSummary) => void | Promise<void>;
}

const CoworkSearchModal: React.FC<CoworkSearchModalProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
}) => {
  const agents = useSelector((state: RootState) => state.agent.agents);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchResultQuery, setSearchResultQuery] = useState('');
  const [searchSessions, setSearchSessions] = useState<CoworkSessionSummary[]>(sessions);
  const [recentSessions, setRecentSessions] = useState<CoworkSessionSummary[]>(sessions);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const reportedOpenRef = useRef(false);
  const reportedEmptyResultKeyRef = useRef<string | null>(null);
  const navigationSourceRef = useRef<'keyboard' | 'pointer'>('keyboard');

  const displayedSessions = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (!trimmedQuery) return recentSessions;
    const resultQuery = searchResultQuery.trim().toLowerCase();
    const titleMatches = resultQuery === trimmedQuery ? searchSessions : [];

    const recentMatches = recentSessions.filter((session) => {
      const agentId = getSessionAgentId(session);
      const agentName = getAgentDisplayNameById(agentId, agents) ?? agentId;
      return session.title.toLowerCase().includes(trimmedQuery)
        || agentName.toLowerCase().includes(trimmedQuery);
    });

    return mergeUniqueSessions(titleMatches, recentMatches);
  }, [agents, recentSessions, searchQuery, searchResultQuery, searchSessions]);

  const agentNameBySessionId = useMemo(() => {
    const names = new Map<string, string>();
    displayedSessions.forEach((session) => {
      const agentId = getSessionAgentId(session);
      names.set(session.id, getAgentDisplayNameById(agentId, agents) ?? agentId);
    });
    return names;
  }, [agents, displayedSessions]);

  const hasQuery = searchQuery.trim().length > 0;

  useEffect(() => {
    if (isOpen) {
      if (!reportedOpenRef.current) {
        reportedOpenRef.current = true;
        reportTaskSearchAction('open', {
          hasQuery: false,
          resultCount: sessions.length,
        });
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
      return;
    }
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSearchResultQuery('');
    reportedOpenRef.current = false;
    reportedEmptyResultKeyRef.current = null;
  }, [isOpen, sessions.length]);

  useEffect(() => {
    if (!isOpen) {
      setSearchSessions(sessions);
      setRecentSessions(sessions);
      setSearchResultQuery('');
    }
  }, [isOpen, sessions]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const query = debouncedSearchQuery.trim();
    setIsLoading(true);
    void coworkService.listSessionsForSearch(SEARCH_SESSION_LIMIT, 0, query)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        if (!result.success || !result.sessions) {
          console.warn('[CoworkSearch] failed to load task search results:', result.error);
          setSearchSessions([]);
          setSearchResultQuery(query);
          return;
        }
        setSearchSessions(result.sessions);
        setSearchResultQuery(query);
        if (!query) {
          setRecentSessions(result.sessions);
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      });
  }, [debouncedSearchQuery, isOpen]);

  useEffect(() => {
    navigationSourceRef.current = 'keyboard';
    setActiveIndex(0);
  }, [displayedSessions]);

  const handleSelectSession = useCallback(async (session: CoworkSessionSummary) => {
    reportTaskSearchAction('select_result', {
      agentType: getSessionAgentType(session),
      hasQuery: searchQuery.trim().length > 0,
      isCurrentSession: session.id === currentSessionId,
      resultCount: displayedSessions.length,
      sessionStatus: session.status,
    });
    await onSelectSession(session);
    onClose();
  }, [currentSessionId, displayedSessions.length, onClose, onSelectSession, searchQuery]);

  const handleClose = useCallback(() => {
    reportTaskSearchAction('close', {
      hasQuery: searchQuery.trim().length > 0,
      resultCount: displayedSessions.length,
    });
    onClose();
  }, [displayedSessions.length, onClose, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      // Let the IME consume keys (including Escape) while composing
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        handleClose();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (displayedSessions.length === 0) return;
        navigationSourceRef.current = 'keyboard';
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((prev) => {
          const count = displayedSessions.length;
          return (prev + delta + count) % count;
        });
        return;
      }
      if (event.key === 'Enter') {
        const session = displayedSessions[activeIndex];
        if (!session) return;
        event.preventDefault();
        void handleSelectSession(session);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, displayedSessions, handleClose, handleSelectSession, isOpen]);

  useEffect(() => {
    if (!isOpen || isLoading || displayedSessions.length > 0) return;
    const emptyResultKey = `${searchQuery.trim().length > 0 ? 'query' : 'recent'}:${searchResultQuery}`;
    if (reportedEmptyResultKeyRef.current === emptyResultKey) return;
    reportedEmptyResultKeyRef.current = emptyResultKey;
    reportTaskSearchAction('empty_result', {
      hasQuery: searchQuery.trim().length > 0,
      resultCount: 0,
    });
  }, [displayedSessions.length, isLoading, isOpen, searchQuery, searchResultQuery]);

  if (!isOpen) return null;

  // The menu style (docs/maties/design.md, section 6): blur, radius 13, the
  // box at the top, results as rows with the conversation's title and age.
  return (
    <Modal
      onClose={handleClose}
      overlayClassName="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(16,20,28,.16)] px-6 pt-[14vh]"
      className="w-full max-w-[600px]"
    >
      <SkinPresentationScope
        enabled
        data-skin-task-search="true"
        role="dialog"
        aria-modal="true"
        aria-label={i18nService.t('search')}
        className="maties-menu overflow-hidden !p-0"
      >
        <div className="maties-hairline-bottom flex items-center gap-3 px-4">
          <MagnifyingGlassIcon className="h-[18px] w-[18px] shrink-0 text-[#9aa1ab]" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={i18nService.t('matiesSearchPlaceholder')}
            aria-label={i18nService.t('search')}
            className="h-[52px] min-w-0 flex-1 bg-transparent text-[15px] text-[#1c1f23] outline-none placeholder:text-[#8f96a0] dark:text-[#f2f3f5]"
          />
          {isLoading && <span className="maties-ring h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <button
            type="button"
            onClick={handleClose}
            aria-label={i18nService.t('close')}
            title={i18nService.t('close')}
            className="maties-kbd shrink-0 cursor-pointer transition-colors hover:text-[#1c1f23]"
          >
            esc
          </button>
        </div>
        <div className="px-2 pb-1.5 pt-2">
          <div className="maties-eyebrow px-2.5 pb-1.5 pt-1 text-[11px]">
            {hasQuery ? i18nService.t('searchResults') : i18nService.t('matiesSearchRecent')}
          </div>
          <div className="max-h-[min(420px,48vh)] overflow-y-auto">
            {displayedSessions.length === 0 ? (
              <div className="maties-caption flex flex-col items-center gap-2 py-10">
                <span>{isLoading ? i18nService.t('loading') : i18nService.t('matiesSearchNoResults')}</span>
              </div>
            ) : (
              displayedSessions.map((session, index) => {
                const agentName = agentNameBySessionId.get(session.id) ?? getSessionAgentId(session);
                const isCurrent = session.id === currentSessionId;
                const isActive = index === activeIndex;
                const isRunning = session.status === CoworkSessionStatusValue.Running;
                const relativeTime = formatAgentTaskRelativeTime(session.updatedAt || session.createdAt);
                return (
                  <button
                    key={session.id}
                    type="button"
                    ref={(node) => {
                      if (node && isActive && navigationSourceRef.current === 'keyboard') {
                        node.scrollIntoView({ block: 'nearest' });
                      }
                    }}
                    onClick={() => void handleSelectSession(session)}
                    onMouseMove={() => {
                      navigationSourceRef.current = 'pointer';
                      if (activeIndex !== index) setActiveIndex(index);
                    }}
                    data-skin-search-result-active={isActive ? 'true' : undefined}
                    data-active={isActive ? 'true' : undefined}
                    className={`maties-menu-item h-9 gap-3 py-0 text-[13.5px] ${isActive ? 'bg-[rgba(16,20,28,.06)]' : ''}`}
                  >
                    {isRunning && (
                      <span
                        className="maties-ring h-3 w-3 shrink-0"
                        title={i18nService.t('myAgentSidebarRunning')}
                        aria-label={i18nService.t('myAgentSidebarRunning')}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[#1c1f23] dark:text-[#f2f3f5]">
                      {renderHighlightedTitle(session.title, searchQuery)}
                    </span>
                    {isCurrent && (
                      <span className="maties-status-pill maties-status-quiet h-5 text-[11px]">
                        {i18nService.t('matiesSearchCurrent')}
                      </span>
                    )}
                    <span className="max-w-[136px] shrink-0 truncate text-[12px] text-[#8f96a0]">
                      {agentName}
                    </span>
                    <span
                      className="w-[44px] shrink-0 text-right text-[11.5px] tabular-nums text-[#a2a29c]"
                      title={relativeTime.full}
                    >
                      {relativeTime.compact}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="maties-hairline-top flex items-center gap-4 px-4 py-2 text-[11.5px] text-[#a2a29c]">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>{i18nService.t('matiesShortcutHintSelect')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            <span>{i18nService.t('matiesShortcutHintOpen')}</span>
          </span>
        </div>
      </SkinPresentationScope>
    </Modal>
  );
};

export default CoworkSearchModal;
