// The Credentials Store (SimeonCore's `CredentialsStoreTests`): entries as
// the server lists them, the editor's checks and bodies, and the page's
// model against a stand-in of the server's routes (the core's test uses
// the demo's store, seeded the same: a GitHub login and a Home contact).

import { describe, expect, it } from 'vitest'
import {
  CredentialsStoreModel,
  cardBrand,
  cardExpiry,
  cardNumberValid,
  credentialSubtitle,
  credentialTitle,
  draftBody,
  draftChanges,
  draftIsEmpty,
  draftOf,
  draftProblem,
  iconSite,
  newDraft,
  storedCredential,
} from './credentialsStore'
import { type JSONObject, type JSONValue, field, str } from './json'
import { credentialSite } from './linkIcons'

/** The server's credentials routes (credentials.py), kept in memory: listed without passwords, read with one, saved, changed (only the fields sent), deleted. */
class CredentialsServer {
  private next = 1
  rows = new Map<string, JSONObject>()
  calls: { path: string; method?: string; body?: JSONValue }[] = []

  constructor() {
    this.rows.set('g1', {
      id: 'g1',
      kind: 'login',
      name: 'GitHub',
      website: 'github.com',
      username: 'theo',
      password: 'demo-Passw0rd-github',
    })
    this.rows.set('h1', {
      id: 'h1',
      kind: 'contact',
      name: 'Home',
      fullName: 'Theo Hart',
      city: 'Seattle',
    })
  }

  private listed(row: JSONObject, withPassword: boolean): JSONObject {
    const { password, ...rest } = row
    const entry: JSONObject = { ...rest }
    if (row.kind === 'login') {
      entry.site = credentialSite(str(row.website) ?? '')
      entry.hasPassword = (str(password) ?? '') !== ''
      if (withPassword) entry.password = password ?? ''
    }
    return entry
  }

  call = async (
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> => {
    this.calls.push({ path, method, body })
    if (path === 'credentials' && method === undefined)
      return {
        entries: [...this.rows.values()].map((row) => this.listed(row, false)),
      }
    if (path === 'credentials' && method === 'POST') {
      const id = `n${this.next++}`
      const row = { ...(body as JSONObject), id }
      this.rows.set(id, row)
      return { entry: this.listed(row, false) }
    }
    const id = path.split('/')[1] ?? ''
    const row = this.rows.get(id)
    if (!row) throw new Error('Not found.')
    if (method === undefined) return { entry: this.listed(row, true) }
    if (method === 'PATCH') {
      Object.assign(row, body as JSONObject)
      return { entry: this.listed(row, false) }
    }
    if (method === 'DELETE') {
      this.rows.delete(id)
      return {}
    }
    throw new Error('No such route.')
  }
}

describe('the Credentials Store (CredentialsStoreTests)', () => {
  it('reads an entry as the server lists it', () => {
    const login = storedCredential({
      id: 'a1',
      kind: 'login',
      name: '',
      website: 'https://www.acme.com/login',
      site: 'acme.com',
      username: 'theo@example.com',
      hasPassword: true,
      hints: 'Use for work',
      savedBy: 'Nora',
    })!
    expect(credentialTitle(login)).toBe('acme.com')
    expect(credentialSubtitle(login)).toBe('theo@example.com')
    expect(iconSite(login)).toBe('acme.com')
    expect(login.savedBy).toBe('Nora')
    expect(login.hasPassword).toBe(true)

    const contact = storedCredential({
      id: 'c1',
      kind: 'contact',
      name: '',
      fullName: '',
      email: 'theo@example.com',
      phone: '+1 206 555 0100',
    })!
    expect(credentialTitle(contact)).toBe('theo@example.com')
    expect(credentialSubtitle(contact)).toBe('theo@example.com')
    expect(iconSite(contact)).toBeUndefined()
    // Cards are never kept here.
    expect(storedCredential({ id: 'x', kind: 'note' })).toBeUndefined()
    // A card (9 November 2026): its network, last four and expiry; never its number.
    const card = storedCredential({
      id: 'k1',
      kind: 'card',
      name: '',
      brand: 'visa',
      last4: '4242',
      expiry: '08/28',
      hasSecurityCode: true,
    })
    if (!card) throw new Error('read')
    expect(credentialTitle(card)).toBe('Visa')
    expect(credentialSubtitle(card)).toBe('•••• 4242 · 08/28')
    expect(cardBrand('5555 5555 5555 4444')).toBe('mastercard')
    expect(cardNumberValid('4242 4242-4242 4242')).toBe(true)
    expect(cardNumberValid('4242 4242 4242 4241')).toBe(false)
    expect(cardExpiry('0828')).toBe('08/28')
    expect(cardExpiry('13/28')).toBeUndefined()
    const draft = {
      ...newDraft('card'),
      number: '4242424242424242',
      expiry: '8/28',
      securityCode: '12',
    }
    expect(draftProblem(draft)).toBe('The security code is 3 or 4 digits.')
    expect(draftProblem({ ...draft, securityCode: '123' })).toBeUndefined()
    expect(draftBody({ ...draft, securityCode: '123' }).expiry).toBe('08/28')
    // A saved card opened without the person's OK keeps its number and code.
    const opened = draftOf(card)
    expect(draftProblem(opened)).toBeUndefined()
    expect(draftChanges({ ...opened, name: 'Travel' }, opened, false)).toEqual({
      name: 'Travel',
    })
    expect(storedCredential({ kind: 'login' })).toBeUndefined()
  })

  it('takes the site as a host without www', () => {
    expect(credentialSite('https://www.Acme.com/login?next=/')).toBe('acme.com')
    expect(credentialSite('login.acme.com')).toBe('login.acme.com')
    expect(credentialSite('acme')).toBe('')
    expect(credentialSite('not a site')).toBe('')
  })

  it('says what to fix as the server would', () => {
    const draft = newDraft('login')
    expect(draftIsEmpty(draft)).toBe(true)
    expect(draftProblem(draft)).toBe('Add the website.')
    draft.website = 'acme'
    expect(draftProblem(draft)).toBe('Write the website like acme.com.')
    draft.website = 'acme.com'
    expect(draftProblem(draft)).toBe('Add the username or the password.')
    draft.password = ' spaced '
    expect(draftProblem(draft)).toBeUndefined()
    // A password is sent exactly as typed.
    expect(draftBody(draft).password).toBe(' spaced ')
    expect(draftBody(draft).kind).toBe('login')

    const contact = newDraft('contact')
    contact.name = 'Home'
    expect(draftProblem(contact)).toBe('Add at least one detail.')
    contact.city = 'Seattle'
    expect(draftProblem(contact)).toBeUndefined()
    // Contact info has no password.
    expect(draftBody(contact).password).toBeUndefined()
  })

  it('sends only what changed', () => {
    const entry = storedCredential({
      id: 'a1',
      kind: 'login',
      name: 'Acme',
      website: 'acme.com',
      username: 'theo',
      hasPassword: true,
    })!
    const opened = draftOf(entry)
    const edited = { ...opened, hints: 'Personal' }
    // Opened without the person's OK: the password field is empty and stays the entry's own.
    expect(draftChanges(edited, opened, false)).toEqual({ hints: 'Personal' })
    edited.password = 'new one'
    expect(draftChanges(edited, opened, false)).toEqual({
      hints: 'Personal',
      password: 'new one',
    })
    // Read with the person's OK, then emptied: the password is cleared.
    const read = draftOf(entry, 'old')
    expect(draftChanges({ ...read, password: '' }, read, true)).toEqual({
      password: '',
    })
    expect(draftChanges(read, read, true)).toEqual({})
  })

  it('lists, reads a password once asked, saves, changes and deletes', async () => {
    const server = new CredentialsServer()
    const model = new CredentialsStoreModel(server.call)
    await model.load()
    expect(model.loaded).toBe(true)
    expect(model.problem).toBeUndefined()
    expect(model.logins.map(credentialTitle)).toEqual(['GitHub'])
    expect(model.contacts.map(credentialTitle)).toEqual(['Home'])
    // Listed without passwords.
    expect(JSON.stringify(server.calls)).not.toContain('Passw0rd')
    const github = model.logins[0]!
    expect(github.hasPassword).toBe(true)
    expect(await model.password(github)).toBe('demo-Passw0rd-github')

    const draft = newDraft('login')
    draft.website = 'https://www.acme.com'
    draft.username = 'bass@example.com'
    draft.password = 's3cret'
    const saved = (await model.save(draft))!
    expect(saved.site).toBe('acme.com')
    expect(model.logins.map(credentialTitle)).toEqual(['acme.com', 'GitHub'])

    const renamed = { ...draftOf(saved), name: 'Acme' }
    const changed = (await model.save(renamed, {
      entry: saved,
      opened: draftOf(saved),
      passwordRead: false,
    }))!
    expect(credentialTitle(changed)).toBe('Acme')
    // Only the name went: a name changed keeps the password.
    expect(server.calls.at(-1)).toEqual({
      path: `credentials/${saved.id}`,
      method: 'PATCH',
      body: { name: 'Acme' },
    })
    expect(await model.password(changed)).toBe('s3cret')

    const calls = server.calls.length
    expect(await model.save(newDraft('login'))).toBeUndefined()
    expect(model.problem).toBe('Add the website.')
    expect(server.calls.length).toBe(calls)

    expect(await model.delete(changed)).toBe(true)
    expect(model.logins.map(credentialTitle)).toEqual(['GitHub'])
    expect(field(server.calls.at(-1), 'method')).toBe('DELETE')
  })

  it('keeps a refusal’s words and the list as it was', async () => {
    const model = new CredentialsStoreModel(async () => {
      throw new Error('Simeon can’t be reached right now.')
    })
    await model.load()
    expect(model.loaded).toBe(false)
    expect(model.problem).toBe('Simeon can’t be reached right now.')
  })
})
