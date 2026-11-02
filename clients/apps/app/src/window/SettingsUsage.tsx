// Settings' Usage & Billing (mac/Simeon/SettingsUsage.swift): "Usage", the
// week's usage (or the trial's) with what is used at the right, when it
// resets under it and its bar across the card, the on-demand spend the same
// way, extra credits, then Choose a plan in the link blue for a person with
// no plan (its line under the card), Cancel Trial when it applies, the
// refresh failure with Retry; then "Plan", the plan and its line, Start
// Plan Now, Upgrade to the plan above, Add Credits and Manage Billing ↗.
// Read when the page shows unless it was read in the last 30 seconds; the
// meters count down every 30 s.
//
// The Mac shows Stripe's page in its own sheet, which comes back on the
// app's link; the web opens it in a new tab, as the access cover does
// (decisions of 1 and 2 November 2026), without telling it the app's
// address, and reads the access, the plan and the usage again when this tab
// comes back to the front, Settings open or not. A tab the browser blocks
// says so in the group's red line. The Mac's charge after Stripe's card
// page (`billing/settle`) is not made: the web can't tell when that page was
// finished. The Windows app opens Stripe's page as the Mac does, in a window
// of its own that comes back on the app's link, then charges and reads
// again; the plans page goes to the default browser (outside.ts).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { plansPage } from '../core/access'
import { t as coreT } from '../core/l10n'
import type { AppStore } from '../core/store'
import { creditsFlow, startNowFlow, upgradeFlow } from '../core/upgrade'
import {
  type Meter,
  type UsageSummary,
  extraCreditsTitle,
  noIncludedUsage,
  onDemandTitle,
  planLine,
  shownSummary,
  usageMeters,
} from '../core/usage'
import { t } from '../l10n'
import { Alert } from './Dialogs'
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsLine,
  SettingsLinkRow,
  SettingsPill,
} from './SettingsParts'
import './SettingsUsage.css'
import { classes } from './classes'
import { inApp, openBillingWindow, openPending } from './outside'
import { useWatched } from './useStore'

/** The time now, again every `every` ms (the Mac's `TimelineView(.periodic(by: 30))`). */
function useNow(every: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

/**
 * This tab coming back to the front after a billing page (the store's
 * `billingTabBack`: the access, the plan and the usage read again, once).
 * Drawn with the window (the account's disc), so it reads them though
 * Settings closed meanwhile; the window's `focus` and the page shown again
 * both say it, and the store reads once for the two.
 */
export function useBillingReturn(store: AppStore): void {
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') void store.billingTabBack()
    }
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [store])
}

/** Only an https page is opened from the app; the quota's own address otherwise gives way to the web's plans page. */
function securePage(url: string): string {
  return url.startsWith('https://') ? url : plansPage
}

export function SettingsUsagePage({ store }: { store: AppStore }) {
  useWatched(store)
  const now = useNow(30_000)
  const opened = () => store.billingTabOpened()
  useEffect(() => {
    void store.loadUsage()
  }, [store])
  const summary = shownSummary(store.usage)
  const loading = store.usage.kind === 'loading'
  return (
    <div className="usage-page">
      {summary ? (
        <>
          <UsageGroup
            store={store}
            summary={summary}
            now={now}
            opened={opened}
          />
          <ManagePlanGroup store={store} summary={summary} opened={opened} />
        </>
      ) : store.usage.kind === 'failed' ? (
        <SettingsGroup>
          <SettingsLine label={t('Couldn’t load usage.')}>
            <SettingsPill
              title={t('Retry')}
              disabled={loading}
              onClick={() => void store.refreshUsage()}
            />
          </SettingsLine>
        </SettingsGroup>
      ) : (
        <SettingsGroup>
          <SettingsLine label={t('Loading usage…')}>
            <span className="settings-spinner" role="progressbar" />
          </SettingsLine>
        </SettingsGroup>
      )}
    </div>
  )
}

/** "Usage": the meters, Choose a plan (no plan), Cancel Trial, and the refresh failure. */
function UsageGroup({
  store,
  summary,
  now,
  opened,
}: {
  store: AppStore
  summary: UsageSummary
  now: number
  opened: () => void
}) {
  const [asking, setAsking] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const meters = usageMeters(summary, now)
  // With a plan, the Plan group below holds the upgrade, the credits and billing; with none (the free month too), Choose a plan.
  const upgrade =
    summary.managePlan === undefined
      ? (meters.upgrade ?? { label: coreT('Choose a plan'), url: plansPage })
      : undefined
  return (
    <SettingsGroup
      title={t('Usage')}
      footer={
        blocked
          ? t('Couldn’t open billing. Try again.')
          : upgrade
            ? meters.upgradeSupportingText
            : undefined
      }
      footerTint={blocked ? 'var(--danger)' : undefined}
    >
      {meters.weekly ? (
        <UsageMeterLine
          title={meters.includedUsageTitle}
          meter={meters.weekly}
        />
      ) : (
        <SettingsLine
          label={meters.includedUsageTitle}
          detail={noIncludedUsage()}
        />
      )}
      {meters.onDemand && (
        <UsageMeterLine
          title={onDemandTitle()}
          meter={meters.onDemand}
          divided
        />
      )}
      {/* Extra credits bought on the web, used after the week's. */}
      {meters.extraCredits !== undefined && (
        <SettingsLine label={extraCreditsTitle()} divided>
          <span className="usage-figure">{meters.extraCredits}</span>
        </SettingsLine>
      )}
      {upgrade && (
        <SettingsActionRow
          title={upgrade.label}
          divided
          onClick={() => {
            // A tab opened blank in the click on the web; the default browser in the Windows app.
            const page = openPending()
            setBlocked(page.refused)
            if (page.refused) return
            page.go(securePage(upgrade.url), { noReferrer: true })
            opened()
          }}
        />
      )}
      {meters.canCancelTrial && (
        <SettingsActionRow
          title={t('Cancel Trial')}
          destructive
          divided
          onClick={() => setAsking(true)}
        />
      )}
      {store.usage.kind === 'failed' && (
        <SettingsLine
          label={t('Couldn’t refresh usage — showing the last known values.')}
          labelTint="var(--danger)"
          divided
        >
          <SettingsPill
            title={t('Retry')}
            onClick={() => void store.refreshUsage()}
          />
        </SettingsLine>
      )}
      {asking && (
        <CancelTrialQuestion store={store} close={() => setAsking(false)} />
      )}
    </SettingsGroup>
  )
}

/**
 * Cancel Trial's question (`PendingAlert`): its button reads "Canceling…"
 * while the call goes and neither button can be pressed; a refusal keeps
 * the question open with its words under the question's own.
 */
function CancelTrialQuestion({
  store,
  close,
}: {
  store: AppStore
  close: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const message = t(
    'This ends your Simeon trial now and removes your remaining trial credits. Your card won’t be charged either way — the trial never turns into a paid plan on its own.',
  )
  return createPortal(
    <div className="usage-question">
      <Alert
        title={t('Cancel your trial?')}
        message={failure ? `${message}\n\n${failure}` : message}
        action={t('Cancel Trial')}
        destructive
        cancel={t('Keep Trial')}
        busy={busy}
        busyAction={t('Canceling…')}
        onAction={() => {
          if (busy) return
          setBusy(true)
          void (async () => {
            const refused = await store.cancelTrial()
            setBusy(false)
            if (refused === undefined) close()
            else setFailure(refused)
          })()
        }}
        onCancel={close}
      />
    </div>,
    document.body,
  )
}

/** A meter (`UsageMeterLine`): its title with what is used at the right (grey), when it resets under it (grey), then its bar across (5, the blue; red past 90%). */
function UsageMeterLine({
  title,
  meter,
  divided,
}: {
  title: string
  meter: Meter
  divided?: boolean
}) {
  const percent = meter.barPercent
  return (
    <div className={classes('usage-meter', divided && 'divided')}>
      <div className="usage-meter-head">
        <div className="usage-meter-words">
          <span className="usage-meter-title">{title}</span>
          {meter.resetLabel !== undefined && (
            <span className="usage-meter-reset">{meter.resetLabel}</span>
          )}
        </div>
        <span className="usage-figure">{meter.valueLabel}</span>
      </div>
      {percent !== undefined && (
        <div
          className="usage-bar"
          role="meter"
          aria-label={`${title}: ${meter.valueLabel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <span
            className={classes('usage-bar-fill', percent > 90 && 'over')}
            style={{
              width: `max(5px, ${Math.min(100, Math.max(0, percent))}%)`,
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * "Plan" (`ManagePlanGroup`): "Current plan: Pro" and its line, Start Plan
 * Now for a card trial, Upgrade to the plan above, Add Credits for a paid
 * plan, then Manage Billing ↗. Each asks the server for Stripe's page
 * ("Opening…" meanwhile) and opens it in a new tab, opened blank at once so
 * the browser lets it open; a failure under the rows in red. In the Windows
 * app, the Mac's sheet: a window of the app's own, "Opening…" while it is
 * open, as the Mac's row reads while its sheet shows.
 */
function ManagePlanGroup({
  store,
  summary,
  opened,
}: {
  store: AppStore
  summary: UsageSummary
  opened: () => void
}) {
  const [opening, setOpening] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const plan = summary.managePlan
  if (!plan) return null
  const web = !summary.billedByApple
  const open = (which: string, flow?: string, tier?: string) => {
    if (opening !== undefined) return
    if (inApp()) {
      setOpening(which)
      setFailure(undefined)
      void openBillingWindow(store, flow, tier).then((failed) => {
        setFailure(failed)
        setOpening(undefined)
      })
      return
    }
    // Opened at once, before the answer, so the browser lets it open; sent to the page once it is known.
    const page = openPending()
    if (page.refused) {
      // The browser blocked it: said in the group's red line, nothing asked of the server.
      setFailure(t('Couldn’t open billing. Try again.'))
      return
    }
    setOpening(which)
    setFailure(undefined)
    void (async () => {
      const answer = await store.billingPortal(flow, tier)
      if (answer.url) {
        page.go(answer.url, { noReferrer: true })
        opened()
      } else {
        page.drop()
        setFailure(answer.message)
      }
      setOpening(undefined)
    })()
  }
  const line = planLine(plan)
  const words = (which: string, title: string) =>
    opening === which ? t('Opening…') : title
  return (
    <SettingsGroup
      title={t('Plan')}
      footer={failure}
      footerTint="var(--danger)"
    >
      <SettingsLine
        label={t`Current plan: ${plan.planName}`}
        detail={line === '' ? undefined : line}
      />
      {/* A card trial starts its plan today; a paid plan adds extra credits. */}
      {web && plan.status === 'trialing' && (
        <SettingsActionRow
          title={words('start', t('Start Plan Now'))}
          divided
          disabled={opening !== undefined}
          onClick={() => open('start', startNowFlow)}
        />
      )}
      {plan.nextTier && (
        <SettingsActionRow
          title={words('upgrade', t`Upgrade to ${plan.nextTier.label}`)}
          divided
          disabled={opening !== undefined}
          onClick={() => open('upgrade', upgradeFlow, plan.nextTier?.tier)}
        />
      )}
      {web && plan.status !== 'trialing' && (
        <SettingsActionRow
          title={words('credits', t('Add Credits'))}
          divided
          disabled={opening !== undefined}
          onClick={() => open('credits', creditsFlow)}
        />
      )}
      <SettingsLinkRow
        label={words('billing', t('Manage Billing'))}
        divided
        external
        onClick={() => open('billing')}
      />
    </SettingsGroup>
  )
}
