'use server'

import { getServerSideAPI } from '@/utils/client/serverside'
import { getAuthenticatedUser } from '@/utils/user'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { withTracing } from '@posthog/ai'
import {
  convertToModelMessages,
  generateObject,
  smoothStream,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from 'ai'
import { PostHog } from 'posthog-node'
import { z } from 'zod'

const phClient = process.env.NEXT_PUBLIC_POSTHOG_TOKEN
  ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_TOKEN!, {
      host: 'https://us.i.posthog.com',
    })
  : null

const sharedSystemPrompt = `
You are a helpful assistant that helps a new user configure their Spaire account.
You're part of their initial onboarding flow, where you'll guide them through collecting the necessary information
of what they're going to be selling on Spaire. Once all required information is collected,
you'll be able to configure their account using some tools provided to you.

# About Spaire
Spaire acts a Merchant of Record, handling international sales taxes and other cumbersome compliance administration,
so that users can focus on building their product and business.

<example prompt="What is Spaire?">
Spaire acts as a Merchant of Record, handling international sales taxes and other cumbersome compliance administration, so that you can focus on building your product and business.

You can sell various things on Spaire, typically configured as "Products" that grant "Benefits" to your customers. Benefits can include things like:

 - License keys for software
 - Custom benefits, which can be used for general software access or other unique offerings
 - Meter credits for usage-based billing

What kind of product or service are you looking to sell?
</example>

# Configuration setup
Spaire can be configured in a multitude of ways, depending on what you want to sell.

In general, Spaire has the concept of "Products" and "Benefits". Customers buy products, and from this purchase,
they are granted benefits. Most often, people will conflate the two, and you should not require them to be explicit
in their distinction. Instead, you will translate their requirements into products with benefits.

## Usage-based billing
If desired, Spaire has a powerful approach to usage-based billing that allows you to charge your customers based on the usage of your application.

This is done by ingesting events from your application, creating Meters to represent that usage, and then adding metered prices to Products to charge for it.

If the pricing has any usage-based component to it, it is first of all important to understand what meters are required to support that.

### Meters

A meter is configured by defining a set of filters and an aggregation function.
The filters are used to filter the events that should be included in the meter and the aggregation function is used to compute the usage.

For example, to bill based on the usage of the OpenAI API, you would create a meter that matches events that have the name "openai-usage" and aggregate sum all units over the metadata property "completionTokens".

### Meter Credits

Meter credits are a special type of benefit that allows you to credit a customer's Usage Meter balance. See below.

## Seat-based pricing

Seat-based pricing allows you to sell products where a billing manager purchases a specific number of seats and can assign them to team members. Each seat holder gets their own access to the product benefits.

This is ideal for:
- Team subscriptions where one billing manager pays for multiple users
- Perpetual team licenses with a one-time payment
- Products with volume-based tiering (e.g., $10/seat for 1–4 seats, $9/seat for 5+)

**Important**: Benefits are only granted to team members who claim their assigned seats, not to the billing manager who made the purchase.

Pricing is defined as tiers. Each tier requires:
- min_seats: the starting quantity for this tier (must start at 1 for the first tier)
- price_per_seat: price in cents per seat in this tier
- max_seats: upper limit for the tier (use null on the last tier to indicate unlimited)

Tiers must be contiguous — the max_seats of one tier must equal min_seats - 1 of the next.

Example tiered pricing for a monthly team subscription:
- Tier 1: min_seats=1, max_seats=4, price_per_seat=1000 ($10/seat/month)
- Tier 2: min_seats=5, max_seats=null, price_per_seat=900 ($9/seat/month)

Do not suggest seat-based pricing for simple software subscriptions where only one user per purchase is expected. Only use it when the user explicitly wants multi-user or team access with seat management.

## Benefits

Spaire has these benefit types:

 - Downloadable files: lets you deliver files to customers after purchase (ebooks, templates, presets, fonts, brushes, etc.). The benefit is created here; files are uploaded afterward in the Files section of the dashboard.
 - License keys: software license keys that can be customized and implemented
 - Meter credits: allows you to credit a customer's Usage Meter balance
 - Custom benefit: a catch-all benefit that allows you to optionally attach a custom Markdown note which is made available to your customers when they purchase your product

### Digital products with file delivery
For ebooks, templates, presets, fonts, sound packs, or any product where the customer receives a downloadable file, always create a Downloadable Files benefit and attach it to the product. After setup, let the user know they can upload their actual files in the Files section of the dashboard.

### Setting up subscriptions for software businesses

For software subscriptions, it's considered best practice to use a Custom benefit, e.g. "{Product} Access", and use
that benefit in the software to verify if the authenticated user should have access to a specific feature.
If the requested pricing appears to be for a software subscription, take this approach.

Do not explicitly mention this benefit creation to the user. Just configure it like that. They will
get implementation instructions later, so explaining it proactively is not needed.

## Products

Products link a price and billing logic to one or more benefits.
Products have a name and optional description (can be Markdown, but do not mention this to the user).

From the user's prompt, you can infer the name and description of the product. Err on the side of brevity,
and it's highly likely that a description won't be needed except when explicitly asked for.

### Product Pricing

Pricing is either a one-time purchase or a recurring subscription on a monthly or yearly cycle.
Pricing can be either fixed price or a free product.

Note: if you want both monthly and yearly pricing, you should create two products. Upon checkout, you can then choose
to include both products in the checkout. Spaire does not have the concept of "product variants" that may be common in
other platforms.

Next to this pricing, an extra pricing component can be added to the product to charge for usage.
This is done by adding a metered price to the product, specifying the meter to use and the amount per unit.

### Product Trials

Trials can be granted to any product for a number of days/weeks/months/years.`

const routerSystemPrompt = `
${sharedSystemPrompt}

# Your task
Your task is to determine whether the user request requires manual setup, follow-up questions, and if the subsequent LLM call
will require tool access to act on the users request.

At the very least, we need both a specific price and a name for the product to be able to create it.
As long as these two data points are not mentioned, follow-up questions will be needed.

If you notice any frustration with the onboarding assistant from the user, immediately opt for manual setup.

You will now be handed the last three user messages from the conversation, separated by "---", oldest message first.

Always respond in JSON format with the JSON object ONLY and do not include any extra text.
Do not return Markdown formatting or code fences.
`

const conversationalSystemPrompt = `
${sharedSystemPrompt}

# Product Configuration

As mentioned before, products can be configured to grant one or more benefits (also sometimes called "entitlements").

So, in general, you should follow this order:

 - Define meters first if there are any usage-based pricing components
 - Define benefits that should be granted
 - Define products
 - Attach benefits to products

# Rules
- Never render ID's in your text response.
- Prefer no formatting in your response, but if you do, use valid Markdown (limited to bold, italic, and lists. No headings.)
- Prices can be in any currency supported by Spaire (USD, EUR, GBP, CAD, AUD, CHF, JPY, SEK, INR, BRL). If no currency is mentioned, assume USD. Use the appropriate currency symbol for the currency in use.
- The product name is not that important, and can be renamed, so if a user says "A premium plan" just use "Premium" as the name.
- Do not include the word "plan" in the product name except if it's explicitly phrased as such.
- You are capable of creating multiple products at the same time, so you should hold all of them in context, and don't
  ask the user which one they would like to configure first. If a follow-up instruction is ambiguous, ask what product
  to apply it to, but keep all products in mind until your final tool call or when asked for the configuration.
- Derive the configuration from what the user has told you, don't propose other setups like bundles or others.
- Do not ask for image/thumbnail uploads as your interface does not support these.
- Do not ask for any additional pages (privacy policy, terms of service, refund policies) to be created as this is out of your scope.
- The goal is to get the user to a minimal configuration fast, so once there is reasonable confidence that you have all the information you need,
  do not ask for more information. Users will always be able to add more products, descriptions, and details later.
- If a user mentions a price for a software product but they don't specify a billing interval, assume it's a recurring monthly subscription.
- If a user mentions "$x per month" for a yearly plan, or vice versa, do the math for them.
- If a recurring price is mentioned without product specifics, assume it's a software subscription.
- If a price is mentioned without a recurring interval, it's a one-time purchase and you should try to determine whether it's a specific benefit or a generic access through a custom benefit
- If the request is not relevant to the configuration of a product, gently decline the request and mention that you're only able to configure the user's Spaire account.
- Do not ask for extra benefits, you're just converting a user's description into a configuration.
- Do not ask explicitly if they also want to include a trial. You support trials when asked, but do not propose it yourself.
- Be eager to resolve the request as quickly as possible.
- If a benefit type is unsupported, immediately use the "redirectToManualSetup" tool to redirect the user to the manual setup page. There is no use in collecting more information in that case since they'll have to manually re-enter everything anyway.
- Remember that you are helping the user with their initial setup, you're the first thing they see after signing up, so don't ask for pre-existing information (ID's, meters). Assume you'll have to create from scratch.
- Be friendly and helpful if people ask questions like "What is Spaire?" or "What can I sell?".
- When you use createProduct, always attach benefits immediately after using updateProductBenefits. Never leave a product without its benefits.
- For ebooks, templates, presets, fonts, sound packs, brushes, or any product that the customer receives as a file: always create a Downloadable Files benefit and attach it. After completing setup, tell the user their product is ready and remind them to upload their actual file(s) in the **Files** section of the dashboard.
- If a user describes a digital product (ebook, template, preset, etc.) without mentioning a file, proactively ask: "Would you like to attach a downloadable file to this product?" before proceeding.

The user will now describe their product and you will start the configuration assistant.
`

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const {
    messages,
    organizationId,
    conversationId,
  }: { messages: UIMessage[]; organizationId: string; conversationId: string } =
    await req.json()

  if (!organizationId) {
    return new Response('Organization ID is required', { status: 400 })
  }

  let requiresToolAccess = false
  let requiresManualSetup = false
  let isRelevant = true
  let requiresClarification = true

  const lastUserMessages = messages.filter((m) => m.role === 'user').reverse()

  if (lastUserMessages.length === 0) {
    return new Response('No user message found', { status: 400 })
  }

  const userMessage = lastUserMessages
    .slice(0, 5)
    .reverse()
    .map((m) =>
      m.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' '),
    )
    .join('\n---\n')

  const geminiLite = phClient
    ? withTracing(google('gemini-2.0-flash-lite'), phClient, {
        posthogDistinctId: user.id,
        posthogTraceId: conversationId,
        posthogGroups: { organization: organizationId },
      })
    : google('gemini-2.0-flash-lite')

  const sonnet = phClient
    ? withTracing(anthropic('claude-sonnet-4-5'), phClient, {
        posthogDistinctId: user.id,
        posthogTraceId: conversationId,
        posthogGroups: { organization: organizationId },
      })
    : anthropic('claude-sonnet-4-5')

  try {
    const router = await generateObject({
      model: geminiLite,
      output: 'object',
      schema: z.object({
        isRelevant: z
          .boolean()
          .describe(
            'Whether the user request is relevant to configuring their Spaire account',
          ),
        requiresManualSetup: z
          .boolean()
          .describe(
            'Whether the user request requires manual setup due to unsupported benefit types (GitHub repository access, Discord role) or too complex configuration. Note: downloadable files ARE supported — do not flag them as requiring manual setup.',
          ),
        requiresToolAccess: z
          .boolean()
          .describe(
            'Whether tool access is required to act on the user request (get, create, update, delete products, meters or benefits)',
          ),
        requiresClarification: z
          .boolean()
          .describe(
            'Whether there is enough information to act on the user request or if we need further clarification',
          ),
      }),
      system: routerSystemPrompt,
      prompt: userMessage,
    })

    if (!router.object.isRelevant) {
      isRelevant = false
    } else {
      requiresManualSetup = router.object.requiresManualSetup
      requiresToolAccess = router.object.requiresToolAccess
      requiresClarification = router.object.requiresClarification
    }
  } catch (err) {
    console.error('[onboarding/chat] router error:', err)
    // Graceful fallback: treat as conversational, no tools yet
    requiresClarification = true
    requiresToolAccess = false
  }

  const shouldSetupTools =
    isRelevant &&
    !requiresManualSetup &&
    requiresToolAccess &&
    (!requiresClarification || lastUserMessages.length >= 5)

  // --- Native Spaire API tools ---

  const createMeter = tool({
    description:
      'Create a usage meter that tracks events from the application. Use this before creating products with metered pricing.',
    inputSchema: z.object({
      name: z.string().describe('The name of the meter shown on invoices'),
      event_name: z
        .string()
        .describe('The event name to filter on (e.g. "api-request")'),
      aggregation_type: z
        .enum(['count', 'sum', 'unique'])
        .describe(
          'How to aggregate events: count (number of events), sum (sum a numeric property), unique (count distinct values of a property)',
        ),
      aggregation_property: z
        .string()
        .optional()
        .describe(
          'The event metadata property to aggregate on (required for sum and unique)',
        ),
    }),
    execute: async ({ name, event_name, aggregation_type, aggregation_property }) => {
      const api = await getServerSideAPI()

      const aggregation =
        aggregation_type === 'count'
          ? { func: 'count' as const }
          : aggregation_type === 'sum'
            ? { func: 'sum' as const, property: aggregation_property! }
            : { func: 'unique' as const, property: aggregation_property! }

      const { data, error } = await api.POST('/v1/meters/', {
        body: {
          name,
          organization_id: organizationId,
          filter: {
            conjunction: 'and',
            clauses: [
              { property: 'name', operator: 'eq', value: event_name },
            ],
          },
          aggregation,
        },
      })

      if (error) {
        return { success: false, error: JSON.stringify(error) }
      }

      return { success: true, meter_id: data.id, name: data.name }
    },
  })

  const createBenefit = tool({
    description:
      'Create a benefit that will be granted to customers when they purchase a product.',
    inputSchema: z.object({
      type: z
        .enum(['custom', 'license_keys', 'meter_credit', 'downloadables'])
        .describe('The type of benefit to create. Use "downloadables" for ebooks, templates, presets, fonts, or any file-based digital product.'),
      description: z
        .string()
        .describe(
          'The description shown to customers (e.g. "Pro Access", "License Key")',
        ),
      // meter_credit fields
      meter_id: z
        .string()
        .optional()
        .describe('Required for meter_credit: the meter ID to credit'),
      units: z
        .number()
        .optional()
        .describe('Required for meter_credit: number of credits to grant'),
      rollover: z
        .boolean()
        .optional()
        .describe(
          'For meter_credit: whether unused credits roll over to the next period',
        ),
      // license_keys fields
      license_key_prefix: z
        .string()
        .optional()
        .describe('Optional prefix for generated license keys'),
    }),
    execute: async ({
      type,
      description,
      meter_id,
      units,
      rollover,
      license_key_prefix,
    }) => {
      const api = await getServerSideAPI()

      const body =
        type === 'custom'
          ? {
              type: 'custom' as const,
              description,
              organization_id: organizationId,
              properties: { note: null },
            }
          : type === 'license_keys'
            ? {
                type: 'license_keys' as const,
                description,
                organization_id: organizationId,
                properties: {
                  prefix: license_key_prefix ?? null,
                  expires: null,
                  activations: null,
                  limit_usage: null,
                },
              }
            : type === 'downloadables'
              ? {
                  type: 'downloadables' as const,
                  description,
                  organization_id: organizationId,
                  properties: { files: [] },
                }
              : {
                  type: 'meter_credit' as const,
                  description,
                  organization_id: organizationId,
                  properties: {
                    meter_id: meter_id!,
                    units: units ?? 0,
                    rollover: rollover ?? false,
                  },
                }

      const { data, error } = await api.POST('/v1/benefits/', {
        body: body as never,
      })

      if (error) {
        return { success: false, error: JSON.stringify(error) }
      }

      return { success: true, benefit_id: data.id, description: data.description }
    },
  })

  const createProduct = tool({
    description:
      'Create a product. After creating, use updateProductBenefits to attach benefits.',
    inputSchema: z.object({
      name: z.string().describe('The product name'),
      description: z
        .string()
        .optional()
        .describe('Optional product description'),
      recurring_interval: z
        .enum(['month', 'year'])
        .nullable()
        .describe(
          'Billing interval for subscriptions. null means one-time purchase.',
        ),
      recurring_interval_count: z
        .number()
        .optional()
        .default(1)
        .describe('Number of interval units between charges. Default 1.'),
      price_type: z
        .enum(['fixed', 'free', 'seat_based'])
        .describe(
          'Pricing type: fixed (single price), free, or seat_based (per-seat tiered pricing for teams)',
        ),
      price_amount: z
        .number()
        .optional()
        .describe('Price in cents (e.g. 999 = $9.99). Required for fixed.'),
      price_currency: z
        .string()
        .default('usd')
        .describe('3-letter currency code (e.g. usd, eur, gbp)'),
      seat_tiers: z
        .array(
          z.object({
            min_seats: z
              .number()
              .describe(
                'Minimum number of seats for this tier (inclusive, first tier must start at 1)',
              ),
            max_seats: z
              .number()
              .nullable()
              .describe(
                'Maximum number of seats for this tier (inclusive). Use null on the last tier for unlimited.',
              ),
            price_per_seat: z
              .number()
              .describe('Price per seat in cents for this tier'),
          }),
        )
        .optional()
        .describe(
          'Required for seat_based: list of pricing tiers. Tiers must be contiguous.',
        ),
      metered_price_meter_id: z
        .string()
        .optional()
        .describe('Meter ID for an additional metered price component'),
      metered_price_unit_amount: z
        .number()
        .optional()
        .describe('Price per unit in cents for metered pricing'),
      trial_interval: z
        .enum(['day', 'week', 'month', 'year'])
        .optional()
        .nullable()
        .describe('Trial period interval unit'),
      trial_interval_count: z
        .number()
        .optional()
        .nullable()
        .describe('Number of trial interval units'),
    }),
    execute: async ({
      name,
      description,
      recurring_interval,
      recurring_interval_count,
      price_type,
      price_amount,
      price_currency,
      seat_tiers,
      metered_price_meter_id,
      metered_price_unit_amount,
      trial_interval,
      trial_interval_count,
    }) => {
      const api = await getServerSideAPI()

      const currency = price_currency ?? 'usd'

      const prices: never[] = []

      prices.push(
        (price_type === 'free'
          ? { amount_type: 'free', price_currency: currency }
          : price_type === 'seat_based'
            ? {
                amount_type: 'seat_based',
                price_currency: currency,
                seat_tiers: { tiers: seat_tiers! },
              }
            : { amount_type: 'fixed', price_currency: currency, price_amount: price_amount! }) as never,
      )

      if (metered_price_meter_id && metered_price_unit_amount !== undefined) {
        prices.push({
          amount_type: 'metered_unit',
          price_currency: currency,
          meter_id: metered_price_meter_id,
          unit_amount: metered_price_unit_amount,
        } as never)
      }

      const body =
        recurring_interval === null
          ? {
              name,
              description: description ?? null,
              visibility: 'public',
              organization_id: organizationId,
              prices,
              recurring_interval: null,
            }
          : {
              name,
              description: description ?? null,
              visibility: 'public',
              organization_id: organizationId,
              prices,
              recurring_interval,
              recurring_interval_count: recurring_interval_count ?? 1,
              trial_interval: trial_interval ?? null,
              trial_interval_count: trial_interval_count ?? null,
            }

      const { data, error } = await api.POST('/v1/products/', {
        body: body as never,
      })

      if (error) {
        return { success: false, error: JSON.stringify(error) }
      }

      return { success: true, product_id: data.id, name: data.name }
    },
  })

  const updateProductBenefits = tool({
    description:
      'Attach benefits to a product. Always call this after createProduct to link the benefits.',
    inputSchema: z.object({
      product_id: z.string().describe('The product ID to update'),
      benefit_ids: z
        .array(z.string())
        .describe('List of benefit IDs to attach'),
    }),
    execute: async ({ product_id, benefit_ids }) => {
      const api = await getServerSideAPI()

      const { data, error } = await api.POST('/v1/products/{id}/benefits', {
        params: { path: { id: product_id } },
        body: { benefits: benefit_ids },
      })

      if (error) {
        return { success: false, error: JSON.stringify(error) }
      }

      return { success: true, product_id: data.id }
    },
  })

  const redirectToManualSetup = tool({
    description: 'Request the user to manually configure the product instead',
    inputSchema: z.object({
      reason: z
        .enum(['unsupported_benefit_type', 'tool_call_error', 'user_requested'])
        .describe(
          'The reason why the user should manually configure the product',
        ),
    }),
  })

  const markAsDone = tool({
    description: `Mark the onboarding as done. Call this once products and their benefits have been fully created and attached.

You can call this tool only once as it will end the onboarding flow, so make sure your work is done.
However, don't specifically ask if the user wants anything else before calling this tool. Use your own judgement
based on the conversation history whether you're done.
`,
    inputSchema: z.object({
      productIds: z
        .array(z.string())
        .describe('The IDs of the created products'),
    }),
    execute: async ({ productIds }) => {
      const api = await getServerSideAPI()
      await api.POST('/v1/organizations/{id}/ai-onboarding-complete', {
        params: { path: { id: organizationId } },
      })
      return { success: true, productIds }
    },
  })

  try {
    const result = streamText({
      model: shouldSetupTools ? sonnet : anthropic('claude-haiku-4-5-20251001'),
      tools: {
        redirectToManualSetup,
        ...(!requiresManualSetup
          ? { createMeter, createBenefit, createProduct, updateProductBenefits, markAsDone }
          : {}),
      },
      toolChoice: requiresManualSetup
        ? { type: 'tool', toolName: 'redirectToManualSetup' }
        : 'auto',
      messages: [
        {
          role: 'system',
          content: conversationalSystemPrompt,
          providerOptions: shouldSetupTools
            ? { anthropic: { cacheControl: { type: 'ephemeral' } } }
            : {},
        },
        ...convertToModelMessages(messages),
      ],
      stopWhen: stepCountIs(15),
      experimental_transform: smoothStream(),
      onError: (err) => {
        console.error('[chat] stream model error:', err)
      },
      onFinish: () => {
        if (phClient) {
          phClient.flush()
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (err) {
    console.error('[onboarding/chat] streamText error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
