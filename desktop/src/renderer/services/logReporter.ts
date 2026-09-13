// Usage analytics, switched off at the source.
//
// Upstream sends every product event to NetEase's analyzer at
// `rlogs.youdao.com`, carrying the installation id, the signed-in user id,
// subscription status, keyfrom attribution and the action — including one
// event fired automatically at app start, before anybody has clicked
// anything. We track nothing, so nothing leaves.
//
// The cut is here, at the one function all 105 call sites go through, rather
// than at the call sites: no url is built, no request is made, and nothing is
// queued to be sent later. The call sites are harmless no-ops and go with the
// screens that make them when the Messages shell lands.
//
// The action constants stay exported because those call sites still name
// them, and re-exporting them keeps this file the only thing to delete.

import type { PublishingIdentityType } from '@shared/publishing/constants';

import {
  type LogEventAction,
  LogReporterAction,
  LogReporterActionPrefix,
  LogReporterCategory,
  LogReporterEndpoint,
  LogReporterEntry,
  LogReporterProduct,
} from '../../shared/analytics/constants';

export {
  LogReporterAction,
  LogReporterActionPrefix,
  LogReporterCategory,
  LogReporterEndpoint,
  LogReporterEntry,
  LogReporterProduct,
};

type LogParamValue = string | number | boolean | null | undefined;

export type { LogEventAction };

export type LogEventParams = Record<string, LogParamValue> & {
  action: LogEventAction;
};

export interface ReportYdAnalyzerOptions {
  /**
   * Kept so existing call sites still type-check. Nothing reads it.
   */
  touchpointIdentityType?: PublishingIdentityType;
}

/**
 * Accepts an event and discards it. Always resolves false, which every call
 * site already treats as "not reported".
 */
export const reportYdAnalyzer = async (
  _params: LogEventParams,
  _options: ReportYdAnalyzerOptions = {},
): Promise<boolean> => false;
