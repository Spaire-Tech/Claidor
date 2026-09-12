/**
 * The work that is in the cloud, above the composer
 * (docs/maties/cloud.md; docs/maties/design.md, section 4).
 *
 * It borrows the shape the design already gives to a thing set aside: one
 * hairline row above the composer, a coloured dot, one plain sentence, and at
 * most one action. It is on every chat screen, and it is rebuilt from what
 * Claidor says rather than from anything this computer remembers — so a job
 * sent last night is still here this morning, whatever happened to the laptop
 * in between.
 *
 * A live job cannot be put away. A finished one can, and « away » is only the
 * app's own view: nothing is deleted on Claidor.
 */

import {
  type MatyJob,
  MatyJobStatus,
  type MatyState,
} from '@shared/maty/constants';
import { isCancellableMatyJob, isLiveMatyJob, visibleMatyJobs } from '@shared/maty/jobList';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import Sphere from '../design/Sphere';
import { getMatyPutAway, onMatyPreferencesChanged, putMatyJobAway } from './matyPreferences';
import { useMatyState } from './useMatyState';

/** Four rows is a strip; more is a list, and a list belongs on its own page. */
const MAX_ROWS = 4;

const DOT_COLOUR: Record<MatyJobStatus, string> = {
  [MatyJobStatus.Queued]: '#8f96a0',
  [MatyJobStatus.Running]: '#0060d0',
  [MatyJobStatus.Done]: '#1f8a4c',
  [MatyJobStatus.Failed]: '#e0322d',
};

const STATUS_KEY: Record<MatyJobStatus, string> = {
  [MatyJobStatus.Queued]: 'matyJobQueued',
  [MatyJobStatus.Running]: 'matyJobRunning',
  [MatyJobStatus.Done]: 'matyJobDone',
  [MatyJobStatus.Failed]: 'matyJobFailed',
};

/** The first line of the work, so the person knows which job a row is. */
const promptLine = (prompt: string): string => {
  const line = prompt.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
};

interface CloudWorkRowProps {
  job: MatyJob;
  /** False while the app has stopped asking Claidor about a live job. */
  watching: boolean;
  onCancel: (jobId: string) => void;
  onPutAway: (jobId: string) => void;
  onCheckAgain: () => void;
}

const CloudWorkRow: React.FC<CloudWorkRowProps> = ({
  job,
  watching,
  onCancel,
  onPutAway,
  onCheckAgain,
}) => {
  const [open, setOpen] = useState(false);
  const live = isLiveMatyJob(job);
  const body = job.status === MatyJobStatus.Failed ? job.error : job.result;
  const canOpen = !live && body.length > 0;

  return (
    <div className="maties-in px-[16px] py-[9px]">
      <div className="flex min-w-0 items-center gap-[10px]">
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: DOT_COLOUR[job.status] }}
        />
        <span
          className={`shrink-0 text-[13.5px] tracking-[-.006em] text-[#4a4f57] ${
            job.status === MatyJobStatus.Running && watching ? 'maties-shimmer' : ''
          }`}
        >
          {i18nService.t(STATUS_KEY[job.status])}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] tracking-[-.006em] text-[#8f96a0]">
          {promptLine(job.prompt)}
        </span>
        {live && !watching && (
          <button type="button" className="maties-pill-sm is-link" onClick={onCheckAgain}>
            {i18nService.t('matyCheckAgain')}
          </button>
        )}
        {isCancellableMatyJob(job) && (
          <button
            type="button"
            className="maties-pill-sm is-ghost"
            onClick={() => onCancel(job.id)}
          >
            {i18nService.t('matyCancelJob')}
          </button>
        )}
        {canOpen && (
          <button
            type="button"
            className="maties-pill-sm is-ghost"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {i18nService.t(open ? 'hide' : 'show')}
          </button>
        )}
        {!live && (
          <button
            type="button"
            className="maties-pill-sm is-ghost"
            onClick={() => onPutAway(job.id)}
          >
            {i18nService.t('matyPutAway')}
          </button>
        )}
      </div>
      {open && canOpen && (
        <div className="maties-in mt-[10px] flex gap-[12px] pb-[4px] pl-[17px]">
          <Sphere size={22} still className="mt-[3px]" />
          {job.status === MatyJobStatus.Failed ? (
            <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.5] text-[#4a4f57]">{body}</p>
          ) : (
            <div className="maties-prose min-w-0 flex-1 whitespace-pre-wrap">{body}</div>
          )}
        </div>
      )}
    </div>
  );
};

const CloudWorkStrip: React.FC = () => {
  const state: MatyState = useMatyState();
  const [putAway, setPutAway] = useState<string[]>(() => getMatyPutAway());

  useEffect(() => onMatyPreferencesChanged(() => setPutAway(getMatyPutAway())), []);

  const rows = useMemo(
    () => visibleMatyJobs(state.jobs, new Set(putAway), MAX_ROWS),
    [state.jobs, putAway],
  );

  const handleCancel = useCallback((jobId: string) => {
    void window.electron.maty.cancel(jobId);
  }, []);

  const handlePutAway = useCallback((jobId: string) => {
    putMatyJobAway(jobId);
  }, []);

  const handleCheckAgain = useCallback(() => {
    void window.electron.maty.refresh();
  }, []);

  if (!state.loaded || rows.length === 0) return null;

  return (
    <div className="maties-in mb-[10px] w-full">
      <div className="maties-divide maties-hairline maties-resting overflow-hidden rounded-[20px] bg-white">
        {rows.map((job) => (
          <CloudWorkRow
            key={job.id}
            job={job}
            watching={state.watching}
            onCancel={handleCancel}
            onPutAway={handlePutAway}
            onCheckAgain={handleCheckAgain}
          />
        ))}
      </div>
    </div>
  );
};

export default CloudWorkStrip;
