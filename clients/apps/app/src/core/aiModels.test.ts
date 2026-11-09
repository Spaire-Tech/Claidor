// AI Models (SimeonCore's `AIModelsTests`): accounts as the server lists
// them, their words, the code sign-in, and the page's model against a
// stand-in of the server's routes (server/simeon/desktop/model_accounts.py,
// own_models.py).

import { describe, expect, it } from 'vitest'
import {
  AIModelsModel,
  accountDetail,
  chatGPTSignIn,
  claudeSignIn,
  modelAccount,
  planName,
  providerName,
  shownAddress,
  startProblem,
  statusWords,
  usable,
} from './aiModels'
import { SimeonAPIError } from './api'
import { GatewayError } from './gatewayConnection'
import { type JSONObject, type JSONValue, field, text } from './json'

describe('an account as the server lists it', () => {
  it('reads its name, kind, plan and how it stands', () => {
    const plus = modelAccount({
      id: 'a1',
      provider: 'chatgpt',
      kind: 'subscription',
      label: 'ada@example.com',
      plan: 'plus',
      status: 'available',
      limitedUntil: null,
      createdAt: 1_700_000_000_000,
    })
    expect(plus).toBeDefined()
    if (!plus) return
    expect(accountDetail(plus)).toBe('Subscription · Plus')
    expect(statusWords(plus)).toBe('Usage available')
    expect(usable(plus)).toBe(true)

    const gone = modelAccount({
      id: 'a2',
      provider: 'chatgpt',
      label: 'Work',
      status: 'signed_out',
    })
    if (!gone) throw new Error('read')
    expect(gone.status).toBe('signed_out')
    expect(accountDetail(gone)).toBe('Subscription')
    expect(statusWords(gone)).toBe('Signed out. Connect again.')
    expect(usable(gone)).toBe(false)

    expect(modelAccount({ provider: 'chatgpt' })).toBeUndefined()
    expect(modelAccount(undefined)).toBeUndefined()
  })

  it('says until when a limit lasts, and the limit ends on its own', () => {
    const now = new Date(1_794_146_400_000) // 8 November 2026, 14:00 UTC
    const until = +now + 2 * 3600 * 1000
    const limited = modelAccount({
      id: 'a1',
      provider: 'chatgpt',
      status: 'limited',
      limitedUntil: until,
    })
    if (!limited) throw new Error('read')
    const words = statusWords(limited, {
      now,
      locale: 'en-US',
      timeZone: 'UTC',
    })
    expect(words).toBe('Limit reached until 4:00 PM')
    expect(usable(limited, now)).toBe(false)
    expect(usable(limited, new Date(until + 1))).toBe(true)
    expect(statusWords(limited, { now: new Date(until + 1) })).toBe(
      'Usage available',
    )
    // Another day: its weekday too.
    const later = statusWords(
      { ...limited, limitedUntil: +now + 26 * 3600 * 1000 },
      { now, locale: 'en-US', timeZone: 'UTC' },
    )
    expect(later).toBe('Limit reached until Mon 4:00 PM')
  })

  it('names the plans as people know them', () => {
    expect(planName('plus')).toBe('Plus')
    expect(planName('pro')).toBe('Pro')
    expect(planName('prolite')).toBe('Pro Lite')
    expect(planName('free_workspace')).toBe('Free Workspace')
  })
})

describe('the code sign-in', () => {
  it('reads the code and where to enter it', () => {
    const signIn = chatGPTSignIn({
      connectId: 'c1',
      userCode: 'ABCD-1234',
      verificationUrl: 'https://auth.openai.com/codex/device',
      interval: 3,
      expiresIn: 900,
    })
    if (!signIn) throw new Error('read')
    expect(signIn.userCode).toBe('ABCD-1234')
    expect(shownAddress(signIn)).toBe('auth.openai.com/codex/device')
    expect(signIn.interval).toBe(3)
    expect(chatGPTSignIn({ connectId: 'c1' })).toBeUndefined()
    // Only a page over https is ever opened.
    expect(
      chatGPTSignIn({
        connectId: 'c1',
        userCode: 'X',
        verificationUrl: 'javascript:alert(1)',
      }),
    ).toBeUndefined()
    expect(startProblem('device_code_off')).toBe(
      "ChatGPT didn't allow signing in with a code. Check your ChatGPT security settings, then try again.",
    )
    expect(startProblem(undefined)).toBe(
      "Couldn't reach ChatGPT. Try again in a moment.",
    )
  })
})

/** The server as the routes answer. */
class StandIn {
  accounts: JSONObject[] = []
  chosen: string | null = null
  polls = 0
  asked: string[] = []

  readonly models: JSONObject[] = [
    {
      modelId: 'own:chatgpt:gpt-6.1-sol',
      modelName: 'GPT-6.1 Sol',
      provider: 'chatgpt',
    },
    {
      modelId: 'own:chatgpt:gpt-6-luna',
      modelName: 'GPT-6 Luna',
      provider: 'chatgpt',
    },
  ]

  own(): JSONObject {
    return {
      model: this.chosen,
      models: this.accounts.length === 0 ? [] : this.models,
    }
  }

  call = async (
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> => {
    const how = method ?? 'GET'
    this.asked.push(`${how} ${path}`)
    switch (`${how} ${path}`) {
      case 'GET models/accounts':
        return { accounts: this.accounts }
      case 'GET models/own':
        return this.own()
      case 'PUT models/own':
        this.chosen = text(field(body, 'model')) ?? null
        return this.own()
      case 'POST models/accounts/chatgpt/start':
        return {
          connectId: 'c1',
          userCode: 'ABCD-1234',
          verificationUrl: 'https://auth.openai.com/codex/device',
          interval: 1,
          expiresIn: 900,
        }
      case 'POST models/accounts/chatgpt/poll': {
        this.polls += 1
        if (this.polls < 2) return { status: 'waiting' }
        const account: JSONObject = {
          id: 'a1',
          provider: 'chatgpt',
          kind: 'subscription',
          label: 'ada@example.com',
          plan: 'plus',
          status: 'available',
        }
        this.accounts = [account]
        return { status: 'connected', account }
      }
      case 'PATCH models/accounts/a1':
        this.accounts = [
          { ...this.accounts[0], label: field(body, 'label') ?? null },
        ]
        return { account: this.accounts[0] }
      case 'DELETE models/accounts/a1':
        this.accounts = []
        this.chosen = null
        return { disconnected: true, revoked: true }
      default:
        throw new SimeonAPIError('not found', 404)
    }
  }
}

const noWait = async () => {}

describe('the page’s model', () => {
  it('connecting uses the best model, and disconnecting goes back to Simeon’s', async () => {
    const server = new StandIn()
    const model = new AIModelsModel(server.call, noWait)
    await model.load()
    expect(model.loaded).toBe(true)
    expect(model.accounts).toEqual([])
    expect(model.chosen).toBeUndefined()
    expect(model.chosenName).toBe("Simeon's models")
    expect(model.connected('chatgpt')).toBe(false)

    const signIn = await model.startChatGPT()
    if (!signIn) throw new Error('a code')
    expect(signIn.userCode).toBe('ABCD-1234')
    const outcome = await model.waitForApproval(signIn)
    if (outcome.kind !== 'connected') throw new Error(outcome.kind)
    expect(outcome.account.label).toBe('ada@example.com')
    expect(server.polls).toBe(2)
    expect(model.accounts.map((one) => one.id)).toEqual(['a1'])
    expect(model.connected('chatgpt')).toBe(true)
    // Connecting is using: the best model chosen.
    expect(model.chosen).toBe('own:chatgpt:gpt-6.1-sol')
    expect(model.chosenName).toBe('GPT-6.1 Sol')

    await model.rename(outcome.account, '  Work   plan ')
    expect(model.accounts[0]?.label).toBe('Work plan')
    const renamed = model.accounts[0]
    if (!renamed) throw new Error('renamed')
    await model.rename(renamed, '   ')
    expect(server.asked.filter((one) => one.startsWith('PATCH'))).toHaveLength(
      1,
    )

    await model.choose(undefined)
    expect(model.chosen).toBeUndefined()
    await model.choose('own:chatgpt:gpt-6-luna')
    expect(model.chosenName).toBe('GPT-6 Luna')

    expect(await model.disconnect(renamed)).toBe(true)
    expect(model.accounts).toEqual([])
    expect(model.chosen).toBeUndefined()
    expect(model.models).toEqual([])
  })

  it('a refused sign-in says why in the person’s words', async () => {
    const model = new AIModelsModel(async (path) => {
      if (path === 'models/accounts/chatgpt/start')
        throw new SimeonAPIError(
          "ChatGPT didn't allow signing in with a code.",
          502,
          { code: 'device_code_off' },
        )
      return { status: 'failed', reason: 'invalid_grant' }
    }, noWait)
    expect(await model.startChatGPT()).toBeUndefined()
    expect(model.problem).toBe(
      "ChatGPT didn't allow signing in with a code. Check your ChatGPT security settings, then try again.",
    )
    const outcome = await model.waitForApproval({
      connectId: 'c1',
      userCode: 'X',
      verificationURL: 'https://auth.openai.com/codex/device',
      interval: 1,
      expiresIn: 60,
    })
    expect(outcome.kind).toBe('failed')
  })

  it('a code that runs out ends the wait', async () => {
    let asked = 0
    const model = new AIModelsModel(async () => {
      asked += 1
      return { status: 'waiting' }
    }, noWait)
    const outcome = await model.waitForApproval({
      connectId: 'c1',
      userCode: 'X',
      verificationURL: 'https://auth.openai.com/codex/device',
      interval: 5,
      expiresIn: 60,
    })
    expect(outcome.kind).toBe('expired')
    expect(asked).toBe(12)
  })

  it('closing the sheet stops the asking', async () => {
    let asked = 0
    const ending = new AbortController()
    const model = new AIModelsModel(
      async () => {
        asked += 1
        if (asked === 3) ending.abort()
        return { status: 'waiting' }
      },
      async (_, signal) => {
        if (signal?.aborted) throw new Error('aborted')
      },
    )
    const outcome = await model.waitForApproval(
      {
        connectId: 'c1',
        userCode: 'X',
        verificationURL: 'https://auth.openai.com/codex/device',
        interval: 5,
        expiresIn: 900,
      },
      ending.signal,
    )
    expect(outcome.kind).toBe('waiting')
    expect(asked).toBe(3)
  })

  it('a server not reached while waiting is asked again', async () => {
    let asked = 0
    const model = new AIModelsModel(async () => {
      asked += 1
      if (asked === 1) throw new Error('offline')
      return { status: 'expired' }
    }, noWait)
    const outcome = await model.waitForApproval({
      connectId: 'c1',
      userCode: 'X',
      verificationURL: 'https://auth.openai.com/codex/device',
      interval: 5,
      expiresIn: 900,
    })
    expect(outcome.kind).toBe('expired')
    expect(asked).toBe(2)
  })
})

describe('Claude in Claude Code on the computer', () => {
  it('signs in on the computer and tells the server only the account', async () => {
    const commands: string[] = []
    const typed: string[] = []
    const told: JSONValue[] = []
    let accounts: JSONObject[] = []
    let chosen: string | null = null
    const claudeModels: JSONObject[] = [
      {
        modelId: 'own:claude:opus',
        modelName: 'Claude Opus',
        provider: 'claude',
      },
      {
        modelId: 'own:claude:sonnet',
        modelName: 'Claude Sonnet',
        provider: 'claude',
      },
    ]
    const own = (): JSONObject => ({
      model: chosen,
      models: accounts.length === 0 ? [] : claudeModels,
    })
    const model = new AIModelsModel(
      async (path, method, body): Promise<JSONValue> => {
        const how = method ?? 'GET'
        if (how === 'GET' && path === 'models/accounts') return { accounts }
        if (how === 'GET' && path === 'models/own') return own()
        if (how === 'PUT' && path === 'models/own') {
          chosen = text(field(body, 'model')) ?? null
          return own()
        }
        if (how === 'POST' && path === 'models/accounts/claude') {
          told.push(body ?? null)
          const account: JSONObject = {
            id: 'c1',
            provider: 'claude',
            kind: 'subscription',
            label: field(body, 'label') ?? null,
            plan: field(body, 'plan') ?? null,
            status: 'available',
          }
          accounts = [account]
          return { account }
        }
        if (how === 'DELETE' && path === 'models/accounts/c1') {
          accounts = []
          chosen = null
          return { disconnected: true, revoked: false }
        }
        throw new SimeonAPIError('not found', 404)
      },
      noWait,
      async (method, args): Promise<JSONValue> => {
        commands.push(method)
        if (method === 'claudeCodeSignInStart')
          return {
            url: 'https://claude.com/cai/oauth/authorize?code=true&state=s1',
          }
        if (method === 'claudeCodeSignInFinish') {
          const code = text(field(args, 'code')) ?? ''
          typed.push(code)
          return code === 'good#s1'
            ? {
                status: 'connected',
                account: {
                  signedIn: true,
                  email: 'ada@example.com',
                  plan: 'max',
                },
              }
            : { status: 'failed', reason: 'refused' }
        }
        return { ok: true }
      },
    )
    const signIn = await model.startClaude()
    expect(signIn?.url).toBe(
      'https://claude.com/cai/oauth/authorize?code=true&state=s1',
    )
    expect((await model.finishClaude('nope')).kind).toBe('refused')
    const done = await model.finishClaude('  good#s1 ')
    if (done.kind !== 'connected') throw new Error(done.kind)
    expect(providerName(done.account.provider)).toBe('Claude')
    expect(accountDetail(done.account)).toBe('Subscription · Max')
    expect(typed).toEqual(['nope', 'good#s1'])
    expect(told).toEqual([{ label: 'ada@example.com', plan: 'max' }])
    expect(model.chosen).toBe('own:claude:opus')
    expect(model.connected('claude')).toBe(true)

    expect(await model.disconnect(done.account)).toBe(true)
    expect(commands).toContain('claudeCodeSignOut')
    expect(model.chosen).toBeUndefined()
  })

  it('a computer without Claude Code says it needs an update', async () => {
    const model = new AIModelsModel(
      async () => ({}),
      noWait,
      async (method) => {
        throw new GatewayError(
          `unknown gateway method: ${method}`,
          true,
          404,
          method,
        )
      },
    )
    expect(await model.startClaude()).toBeUndefined()
    expect(model.problem).toBe(
      'Your computer needs an update before it can run Claude Code.',
    )
    expect(
      claudeSignIn({ url: 'https://evil.example/oauth/authorize' }),
    ).toBeUndefined()
    expect(
      claudeSignIn({ url: 'http://claude.com/oauth/authorize' }),
    ).toBeUndefined()
  })
})
