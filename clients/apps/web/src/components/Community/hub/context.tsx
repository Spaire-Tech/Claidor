'use client'

/**
 * Community Hub — viewer context.
 *
 * The hub's leaf components (Composer, HubPost, comments, polls, activity &
 * event tabs) are shared between the CREATOR console and the STUDENT (customer
 * portal) view. This context carries the few things that differ between them:
 *
 *  - `mode`  — which API surface to hit (`creator` = dashboard creds,
 *              `customer` = customer-portal token).
 *  - `token` — the customer session token (null for the creator).
 *  - `viewer`— `host` unlocks moderation (pin, remove any post); `member` is
 *              limited to their own content.
 *  - `selfEnrollmentId` — the student's own enrollment, used to detect their
 *              own posts so a member can delete just those.
 *
 * The DEFAULT is the creator/host configuration, so existing creator usage is
 * unchanged: a component reading `useHub()` without a provider behaves exactly
 * as it did when it hard-coded `'creator'`.
 */
import { type CommunityIOMode } from '@/hooks/queries/community'
import * as React from 'react'

export type HubViewer = 'host' | 'member'

export type HubCtx = {
  mode: CommunityIOMode
  token: string | null
  viewer: HubViewer
  selfEnrollmentId: string | null
}

const DEFAULT_CTX: HubCtx = {
  mode: 'creator',
  token: null,
  viewer: 'host',
  selfEnrollmentId: null,
}

const HubContext = React.createContext<HubCtx>(DEFAULT_CTX)

export const HubProvider = HubContext.Provider

export const useHub = (): HubCtx => React.useContext(HubContext)
