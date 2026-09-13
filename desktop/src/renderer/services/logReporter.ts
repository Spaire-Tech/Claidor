import type { PublishingIdentityType } from '@shared/publishing/constants';

import {
  type LogEventAction,
  LogReporterAction,
  LogReporterActionPrefix,
  LogReporterCategory,
  LogReporterEntry,
  LogReporterProduct,
} from '../../shared/analytics/constants';

export {
  LogReporterAction,
  LogReporterActionPrefix,
  LogReporterCategory,
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
   * Identity at the product touchpoint being attributed. Kept so the call
   * sites still type-check; nothing reads it.
   */
  touchpointIdentityType?: PublishingIdentityType;
}

/**
 * Does nothing, on purpose. Maties keeps no usage analytics.
 *
 * It used to send a beacon per event carrying the action, the signed-in user
 * id, a durable installation uuid, app version, platform, architecture,
 * language and install attribution. There was a setting to turn it off and it
 * defaulted to on. Those events went to Claidor rather than to NetEase, and
 * Claidor discarded them — but the founder asked for nothing at all, so
 * nothing is now sent rather than sent and thrown away.
 *
 * The call sites are left in place: they name the moments the product
 * considers worth noticing, which is worth keeping while the app is still
 * being gone through screen by screen. Nothing leaves the machine — there is
 * no address to send to, no queue, and no installation id. If analytics are
 * ever wanted, they get designed and consented to then.
 */
export const reportYdAnalyzer = async (
  _params: LogEventParams,
  _options: ReportYdAnalyzerOptions = {},
): Promise<boolean> => false;
