// Connecting an app (mac/Simeon/MacConnector.swift, `MacConnector`): the
// consent first (`ConnectConsent`, ConnectConsent.tsx), then the app's
// sign-in, closed once the app is connected. One for the window, shared
// through `ConnectorContext`: the chat's cards (Connect), Connectors' rows
// and pages (Add, Connect, an account's sign-in, Add Another Account) all
// go through it, so one sign-in is open at a time.
//
// The frame (step 6a) gives its shape; step 6b writes what each does.

import { createContext, useContext } from 'react'
import type { AppStore } from '../core/store'

/** How a sign-in ended (Connecting.swift's `SignInEnd`): a Connect takes back the app it added only when the person cancelled. */
export type SignInEnd = 'connected' | 'cancelled' | 'unconfirmed' | 'replaced'

/** The consent over the window, and what Connect then does (`MacConnector.Ask`). */
export interface ConnectAsk {
  /** The app's name, as the catalogue or the card names it. */
  name: string
  go: () => Promise<void>
}

export class Connector {
  private listeners = new Set<() => void>()
  private version = 0

  /** The consent over the window, or none (`asking`). */
  asking?: ConnectAsk
  /** The app whose sign-in is open (its name), or none (`connecting`): the other Connect buttons wait. */
  connecting?: string

  constructor(readonly store: AppStore) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  protected changed(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  /** The consent is over the window: its Return and Escape are its own (`MacConnector.showing`). */
  get showing(): boolean {
    return this.asking !== undefined
  }

  /** The consent for `name`, then `go` on Connect (`ask(_:store:then:)`). */
  ask(name: string, go: () => Promise<void>): void {
    this.asking = { name, go }
    this.changed()
  }

  cancel(): void {
    if (!this.asking) return
    this.asking = undefined
    this.changed()
  }

  confirm(): void {
    const ask = this.asking
    if (!ask) return
    this.asking = undefined
    this.changed()
    void ask.go()
  }

  /** A chat card's Connect (`connect(_:store:)`): the consent, then the app added and its sign-in in one go (6b). */
  connect(name: string): void {
    void name
  }

  /** Add Another Account for an app Simeon Labs' server serves (`addAccount(_:name:store:)`, 6b). */
  addAccount(toolkit: string, name: string): void {
    void toolkit
    void name
  }

  /** The app's sign-in page, closed once `done` says so (`signIn(_:name:store:done:)`, 6b). */
  async signIn(
    url: string,
    name: string,
    done: () => Promise<boolean>,
  ): Promise<SignInEnd> {
    void url
    void name
    void done
    return 'unconfirmed'
  }
}

export const ConnectorContext = createContext<Connector | undefined>(undefined)

/** The window's connector; none outside the window (a card drawn on its own, in a test). */
export function useConnector(): Connector | undefined {
  return useContext(ConnectorContext)
}
