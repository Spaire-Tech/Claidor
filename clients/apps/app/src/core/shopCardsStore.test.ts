// The shop cards' buttons, as the Mac's cards send them (SimeonCore's
// Store.swift: `answerPurchase`, `purchaseApproval`, `pickPurchaseCard`,
// `buyProduct`, `keepWatchingPurchase`; PurchaseCardTests.swift and
// ProductsCardTests.swift): an answer shown at once, put back when it
// doesn't reach the computer or the computer doesn't take it, kept until
// the computer's copy has it; the card picked riding with Allow; the
// device's approval; Buy; Link watched again.

import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import type { JSONObject } from './json'
import { makeAgent } from './models'
import {
  payingLine,
  productsCard,
  purchaseCard,
  shownProducts,
  shownPurchase,
} from './shopCards'
import { AppStore } from './store'
import { FakeBackend } from './testing'

const purchase: JSONObject = {
  type: 'purchase',
  content: 'Checkout at ncvss.com · $80.00',
  purchase: {
    merchant: 'NCVSS',
    domain: 'ncvss.com',
    url: 'https://ncvss.com/checkout',
    total: '$80.00',
    items: [{ name: 'Linen shirt, white', quantity: 1 }],
    card: { brand: 'Visa', last4: '1234', name: 'Visa Signature' },
    cards: [
      {
        id: 'csmrpd_demo_visa',
        brand: 'Visa',
        last4: '1234',
        name: 'Visa Signature',
        isDefault: true,
      },
      {
        id: 'csmrpd_demo_mc',
        brand: 'Mastercard',
        last4: '1005',
        name: 'Mastercard Debit',
      },
    ],
    test: true,
    link: { paymentMethodId: 'csmrpd_demo_visa' },
  },
}

const products: JSONObject = {
  type: 'products',
  content: 'Linen shirt, white · $72.00',
  products: [
    {
      title: 'Linen shirt, white',
      url: 'https://ncvss.com/products/linen-shirt',
      price: '$72.00',
    },
    {
      title: 'Linen trousers',
      url: 'https://ncvss.com/products/linen-trousers',
      price: '$96.00',
    },
  ],
}

const line = (id: string, message: JSONObject, more: JSONObject = {}) =>
  Entry.from({ kind: 'send-message', id, message, timestampMs: 1, ...more })!

/** A computer that answers `answerPurchase` with the card as it stamps it, as the host does. */
function computer() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'cards', name: 'Iris' })]
  backend.commandAnswers.answerPurchase = (args) => {
    const { entryId, allow, resume } = args as JSONObject
    if (resume === true) return null
    return line(entryId as string, purchase, {
      purchaseState: allow === true ? 'sending' : 'denied',
    }).raw
  }
  return { backend }
}

const sent = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

/** The store's own copy of the chat, as the computer sends it. */
function copy(store: AppStore, entries: Entry[]) {
  ;(
    store as unknown as {
      setTranscript: (agentId: string, entries: Entry[]) => void
    }
  ).setTranscript('cards', entries)
}

describe('the checkout card’s buttons', () => {
  it('shows Allow at once, with the card picked on it, until the computer’s copy says so', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    const card = purchaseCard(line('x12p', purchase))!
    expect(payingLine(card)).toBe('Visa Signature •••• 1234')
    // Another of the person's cards, picked on the card: shown at once, and it rides with Allow.
    store.pickPurchaseCard('x12p', 'csmrpd_demo_mc')
    expect(
      payingLine(
        shownPurchase(card, undefined, store.pickedPurchaseCards.x12p),
      ),
    ).toBe('Mastercard Debit •••• 1005')
    const allowing = store.answerPurchase('x12p', true, 'cards')
    expect(store.answeredPurchases.x12p).toBe('sending')
    expect(shownPurchase(card, store.answeredPurchases.x12p).state).toBe(
      'sending',
    )
    await allowing
    expect(sent(backend, 'answerPurchase')).toEqual([
      {
        agentId: 'cards',
        entryId: 'x12p',
        allow: true,
        paymentMethodId: 'csmrpd_demo_mc',
      },
    ])
    // The computer took it: shown until its copy of the chat has it, then its copy takes over.
    expect(store.answeredPurchases.x12p).toBe('sending')
    copy(store, [line('x12p', purchase)])
    expect(store.answeredPurchases.x12p).toBe('sending')
    const taken = line('x12p', purchase, {
      purchaseState: 'approving',
      purchasePaymentMethodId: 'csmrpd_demo_mc',
      purchaseCard: {
        brand: 'Mastercard',
        last4: '1005',
        name: 'Mastercard Debit',
      },
    })
    copy(store, [taken])
    expect(store.answeredPurchases.x12p).toBeUndefined()
    // The card picked paid; the pick on this device no longer counts.
    const now = shownPurchase(
      purchaseCard(taken)!,
      store.answeredPurchases.x12p,
      store.pickedPurchaseCards.x12p,
    )
    expect(now.state).toBe('approving')
    expect(payingLine(now)).toBe('Mastercard Debit •••• 1005')
    // A second Allow on the same card goes nowhere while the first is shown.
    await store.answerPurchase('x12q', false, 'cards')
    await store.answerPurchase('x12q', true, 'cards')
    expect(sent(backend, 'answerPurchase').length).toBe(2)
    expect(sent(backend, 'answerPurchase')[1]).toEqual({
      agentId: 'cards',
      entryId: 'x12q',
      allow: false,
    })
    expect(store.answeredPurchases.x12q).toBe('denied')
  })

  it('never sends the card picked with Deny', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    store.pickPurchaseCard('x12p', 'csmrpd_demo_mc')
    await store.answerPurchase('x12p', false, 'cards')
    expect(sent(backend, 'answerPurchase')).toEqual([
      { agentId: 'cards', entryId: 'x12p', allow: false },
    ])
  })

  it('puts the buttons back when the answer doesn’t reach the computer, with the core’s line', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    backend.refusedCommands.add('answerPurchase')
    await store.answerPurchase('x12p', true, 'cards')
    expect(store.answeredPurchases.x12p).toBeUndefined()
    expect(store.problem).toBe(
      "The purchase didn't go to Link: The computer didn't answer.",
    )
    await store.answerPurchase('x12p', false, 'cards')
    expect(store.answeredPurchases.x12p).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't deny the purchase: The computer didn't answer.",
    )
  })

  it('puts the buttons back when the card still waits (Link refused the card picked)', async () => {
    const { backend } = computer()
    backend.commandAnswers.answerPurchase = () =>
      line('x12p', purchase, {
        purchaseNote:
          "Link won't let an agent pay with the Mastercard Debit ending 1005. Choose another card.",
      }).raw
    const store = new AppStore()
    await store.attach(backend)
    await store.answerPurchase('x12p', true, 'cards')
    expect(store.answeredPurchases.x12p).toBeUndefined()
    expect(store.problem).toBeUndefined()
    // A card the computer no longer has (`null`) keeps the answer shown, as the core's.
    backend.commandAnswers.answerPurchase = () => null
    await store.answerPurchase('x12p', true, 'cards')
    expect(store.answeredPurchases.x12p).toBe('sending')
  })

  it('carries the approval given on the device, who and when and how', async () => {
    const { backend } = computer()
    const store = new AppStore()
    const faceID = { method: 'biometric_face', deviceType: 'mobile' }
    // Nobody signed in: Link asks in its app.
    expect(store.purchaseApproval(faceID)).toBeUndefined()
    // An account known by its e-mail only (remembered from an older launch): it still approves, as that e-mail.
    store.account = { name: 'Bass Fall', email: 'bass@simeonlabs.com' }
    expect(store.purchaseApproval(faceID)?.userId).toBe('bass@simeonlabs.com')
    store.account = {
      name: 'Bass Fall',
      email: 'bass@simeonlabs.com',
      id: '8a6b0b0e-user',
    }
    const at = new Date(1_760_430_000_000)
    expect(store.purchaseApproval(faceID, at)).toEqual({
      approvedAt: 1_760_430_000,
      userId: '8a6b0b0e-user',
      authenticationMethod: 'biometric_face',
      deviceType: 'mobile',
      userName: 'Bass Fall',
    })
    // A passcode or a Mac: no how, no device.
    expect(store.purchaseApproval({}, at)).toEqual({
      approvedAt: 1_760_430_000,
      userId: '8a6b0b0e-user',
      userName: 'Bass Fall',
    })
    // Allow confirmed on the device carries it; the web's Allow, with none, doesn't.
    await store.attach(backend)
    await store.answerPurchase('x12p', true, 'cards', faceID)
    await store.answerPurchase('x12q', true, 'cards')
    const [confirmed, plain] = sent(backend, 'answerPurchase') as JSONObject[]
    expect((confirmed!.approval as JSONObject).userId).toBe('8a6b0b0e-user')
    expect((confirmed!.approval as JSONObject).authenticationMethod).toBe(
      'biometric_face',
    )
    expect(plain!.approval).toBeUndefined()
  })

  it('keeps the account’s id when a name is saved, so Allow still carries the approval', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    store.account = {
      name: 'Bass Fall',
      email: 'bass@simeonlabs.com',
      id: '8a6b0b0e-user',
    }
    await store.saveName('Bass')
    expect(store.account?.name).toBe('Bass')
    expect(store.account?.id).toBe('8a6b0b0e-user')
  })

  it('asks the computer to keep watching Link, once per card and state, and says nothing if it can’t', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.keepWatchingPurchase('x12p', 'cards')
    await store.keepWatchingPurchase('x12p', 'cards')
    await store.keepWatchingPurchase('fc1', 'cards', 'approved')
    expect(sent(backend, 'answerPurchase')).toEqual([
      { agentId: 'cards', entryId: 'x12p', resume: true },
      { agentId: 'cards', entryId: 'fc1', resume: true },
    ])
    expect(store.answeredPurchases).toEqual({})
    backend.refusedCommands.add('answerPurchase')
    await store.keepWatchingPurchase('x12r', 'cards')
    expect(store.problem).toBeUndefined()
  })

  it('forgets every answer on signing out', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    store.pickPurchaseCard('x12p', 'csmrpd_demo_mc')
    await store.answerPurchase('x12p', true, 'cards')
    await store.buyProduct('x12o', 1, 'cards')
    await store.keepWatchingPurchase('x12p', 'cards')
    store.detach()
    expect(store.answeredPurchases).toEqual({})
    expect(store.pickedPurchaseCards).toEqual({})
    expect(store.pressedProducts).toEqual({})
    // Watched again in the next sign-in.
    await store.attach(backend)
    await store.keepWatchingPurchase('x12p', 'cards')
    expect(
      sent(backend, 'answerPurchase').filter(
        (args) => (args as JSONObject).resume === true,
      ).length,
    ).toBe(2)
  })
})

describe('the products card’s Buy', () => {
  it('goes to the computer with the product’s place, shown at once until the computer’s copy says so', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    const card = productsCard(line('x12o', products))!
    expect(
      shownProducts(card, store.pressedProducts.x12o).buying,
    ).toBeUndefined()
    const buying = store.buyProduct('x12o', 1, 'cards')
    // Shown at once.
    expect(shownProducts(card, store.pressedProducts.x12o).buying).toBe(1)
    await buying
    expect(sent(backend, 'buyProduct')).toEqual([
      { agentId: 'cards', entryId: 'x12o', index: 1 },
    ])
    // The same product again goes nowhere.
    await store.buyProduct('x12o', 1, 'cards')
    expect(sent(backend, 'buyProduct').length).toBe(1)
    // The computer's own copy takes over: Buying, then Bought.
    copy(store, [line('x12o', products)])
    expect(store.pressedProducts.x12o).toBe(1)
    copy(store, [line('x12o', products, { productsBuying: 1 })])
    expect(store.pressedProducts.x12o).toBeUndefined()
    await store.buyProduct('x12n', 0, 'cards')
    copy(store, [line('x12n', products, { productsBought: [0] })])
    expect(store.pressedProducts.x12n).toBeUndefined()
  })

  it('comes back to the button when the computer refuses it, with the core’s line', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    backend.refusedCommands.add('buyProduct')
    await store.buyProduct('x12o', 0, 'cards')
    expect(store.pressedProducts.x12o).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't tell your agent to buy it: The computer didn't answer.",
    )
  })
})
