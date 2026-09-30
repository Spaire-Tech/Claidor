export interface BaseIntegration {
  slug: string
  name: string
  tagline: string
  description: string
  category: 'ai-builder' | 'backend' | 'framework' | 'auth'
  categoryLabel: string
  howItWorks: { title: string; description: string }[]
  comingSoon?: boolean
}

export interface PromptIntegration extends BaseIntegration {
  type: 'prompt'
  prompt: string
  promptFileName: string
  footerNote: string
}

export interface SdkIntegration extends BaseIntegration {
  type: 'sdk'
  packages: string
  pythonInstall?: string
  docsLink: string
  code: string
  codeLang: 'typescript' | 'python' | 'bash' | 'go' | 'php'
  envVars: string
}

export type Integration = PromptIntegration | SdkIntegration

export const NEXTJS_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'nextjs',
  name: 'Next.js',
  tagline: 'Build with Next.js. Monetize with Simeon.',
  description:
    'The official @simeon/nextjs adapter gives you checkout, customer portal, and webhooks out of the box \u2014 the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/nextjs to your project',
    },
    {
      title: 'Add route handler',
      description: 'One-line checkout API route',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: '@simeon/nextjs',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/nextjs',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Checkout } from "@simeon/nextjs";

// app/api/checkout/route.ts
export const GET = Checkout({
  accessToken: process.env.SIMEON_ACCESS_TOKEN,
  successUrl: process.env.SIMEON_SUCCESS_URL,
});`,
}

export const LOVABLE_INTEGRATION: PromptIntegration = {
  type: 'prompt',
  slug: 'lovable',
  name: 'Lovable',
  tagline: 'Build with Lovable. Monetize with Simeon.',
  description:
    'Simeon partners with Lovable to bring billing directly into your app. Just copy the prompt below, paste it into Lovable, and you\u2019ll have a fully working checkout page.',
  category: 'ai-builder',
  categoryLabel: 'AI App Builder',
  howItWorks: [
    { title: 'Copy prompt', description: 'Grab the ready-made prompt below' },
    {
      title: 'Paste in Lovable',
      description: 'Lovable builds your pricing page',
    },
    {
      title: 'Add checkout links',
      description: 'Drop in your Simeon URLs after creating products',
    },
  ],
  prompt: `Add Simeon payment checkout to my app. Simeon is my billing provider — it handles payments through a hosted checkout overlay. No API keys or environment variables needed in the frontend.

Here's how it works:
- Simeon uses checkout links (simple URLs) that open a secure payment overlay on top of your app
- No backend code, no API keys, no .env variables — just a script tag and links

Please do the following:

1. Add this script tag to index.html, right before the closing </body> tag:

<script defer data-auto-init src="https://cdn.simeonlabs.com/checkout/embed.js"></script>

2. Create a /pricing page with a clean layout showing plan cards. For each plan's call-to-action button, use an anchor tag like this:

<a href="CHECKOUT_LINK_URL" data-simeon-checkout data-simeon-checkout-theme="light">
  Get Started
</a>

Use "CHECKOUT_LINK_URL" as a placeholder — I'll replace it with my actual checkout link from the Simeon dashboard after I create my products there.

3. When a user clicks the button, Simeon's checkout overlay will open automatically (handled by the script). No onClick handler needed.

4. Create a /checkout/success page that displays a confirmation message after a successful purchase.

5. Style the pricing page and success page to match the rest of the app's design.`,
  promptFileName: 'lovable-prompt.txt',
  footerNote:
    'After creating your product in the Simeon dashboard, you\u2019ll get a checkout link URL to replace the CHECKOUT_LINK_URL placeholder above.',
}

export const SUPABASE_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'supabase',
  name: 'Supabase',
  tagline: 'Build with Supabase. Monetize with Simeon.',
  description:
    'Use the Simeon SDK inside Supabase Edge Functions to create checkouts, handle webhooks, and manage subscriptions \u2014 all serverless.',
  category: 'backend',
  categoryLabel: 'Backend Platform',
  howItWorks: [
    {
      title: 'Install SDK',
      description: 'Add @spaire/sdk to your Supabase project',
    },
    {
      title: 'Create Edge Function',
      description: 'Handle checkouts and webhooks serverless',
    },
    {
      title: 'Go live',
      description: 'Deploy and start accepting payments',
    },
  ],
  packages: '@spaire/sdk',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/supabase',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Simeon } from "@spaire/sdk";

const simeon = new Simeon({
  accessToken: Deno.env.get("SIMEON_ACCESS_TOKEN")!,
});

Deno.serve(async (req) => {
  const { productId } = await req.json();

  const checkout = await simeon.checkouts.create({
    products: [productId],
    successUrl: Deno.env.get("SIMEON_SUCCESS_URL")!,
  });

  return new Response(
    JSON.stringify({ url: checkout.url }),
    { headers: { "Content-Type": "application/json" } }
  );
});`,
}

export const V0_INTEGRATION: PromptIntegration = {
  type: 'prompt',
  slug: 'v0',
  name: 'v0',
  tagline: 'Build with v0. Monetize with Simeon.',
  description:
    'Simeon works natively with v0-generated Next.js apps. Copy this prompt into v0 to generate a complete pricing page with Simeon\u2019s checkout overlay \u2014 no backend setup required.',
  category: 'ai-builder',
  categoryLabel: 'AI App Builder',
  howItWorks: [
    { title: 'Copy prompt', description: 'Grab the ready-made prompt below' },
    {
      title: 'Paste in v0',
      description: 'v0 generates your pricing page',
    },
    {
      title: 'Add checkout links',
      description: 'Drop in your Simeon URLs after creating products',
    },
  ],
  prompt: `Add Simeon payment checkout to my Next.js app. Simeon is my billing provider \u2014 it handles payments through a hosted checkout overlay. No API keys or environment variables needed in the frontend.

Here's how it works:
- Simeon uses checkout links (simple URLs) that open a secure payment overlay on top of your app
- No backend code, no API keys, no .env variables \u2014 just a Script tag and links
- Works natively with Next.js

Please do the following:

1. Add the Simeon checkout embed script in the root layout (app/layout.tsx), right before the closing </body> tag:

import Script from "next/script";

<Script
  defer
  data-auto-init
  src="https://cdn.simeonlabs.com/checkout/embed.js"
  strategy="afterInteractive"
/>

2. Create a /pricing page with a modern pricing card layout using Tailwind CSS and shadcn/ui. For each plan's call-to-action button, use an anchor tag:

<a
  href="CHECKOUT_LINK_URL"
  data-simeon-checkout
  data-simeon-checkout-theme="light"
  className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
>
  Get Started
</a>

Use "CHECKOUT_LINK_URL" as a placeholder \u2014 I'll replace it with my actual checkout link from the Simeon dashboard after I create my products there.

3. When a user clicks the button, Simeon's checkout overlay opens automatically (handled by the script). No onClick handler needed.

4. Create a /checkout/success page that displays a clean confirmation message after a successful purchase, with a button to return to the dashboard.

5. Style the pricing page with:
   - A header section with a title and subtitle
   - 2-3 pricing cards in a responsive grid
   - Each card showing the plan name, price, feature list, and CTA button
   - A "Most Popular" badge on the recommended plan
   - Light/dark mode support using Tailwind's variants`,
  promptFileName: 'v0-simeon-prompt.txt',
  footerNote:
    'After creating your product in the Simeon dashboard, you\u2019ll get a checkout link URL to replace the CHECKOUT_LINK_URL placeholder above.',
}

export const REPLIT_INTEGRATION: PromptIntegration = {
  type: 'prompt',
  slug: 'replit',
  name: 'Replit',
  tagline: 'Build with Replit. Monetize with Simeon.',
  description:
    'Add billing to any Replit app in seconds. Copy this prompt, paste it into Replit Agent, and it builds a complete checkout flow with Simeon\u2019s payment overlay.',
  category: 'ai-builder',
  categoryLabel: 'AI App Builder',
  howItWorks: [
    { title: 'Copy prompt', description: 'Grab the ready-made prompt below' },
    {
      title: 'Paste in Replit Agent',
      description: 'The Agent builds your pricing page',
    },
    {
      title: 'Add checkout links',
      description: 'Drop in your Simeon URLs after creating products',
    },
  ],
  prompt: `Add Simeon payment checkout to my app. Simeon is my billing provider \u2014 it handles payments through a hosted checkout overlay. No API keys or environment variables needed in the frontend.

Here's how it works:
- Simeon uses checkout links (simple URLs) that open a secure payment overlay on top of your app
- No backend code, no API keys, no .env variables \u2014 just a script tag and links

Please do the following:

1. Add this script tag to the main HTML file (index.html or equivalent), right before the closing </body> tag:

<script defer data-auto-init src="https://cdn.simeonlabs.com/checkout/embed.js"></script>

2. Create a /pricing page with a clean layout showing plan cards. For each plan's call-to-action button, use an anchor tag like this:

<a href="CHECKOUT_LINK_URL" data-simeon-checkout data-simeon-checkout-theme="light">
  Get Started
</a>

Use "CHECKOUT_LINK_URL" as a placeholder \u2014 I'll replace it with my actual checkout link from the Simeon dashboard after I create my products there.

3. When a user clicks the button, Simeon's checkout overlay will open automatically (handled by the script). No onClick handler needed.

4. Create a /checkout/success page that displays a confirmation message after a successful purchase.

5. Style the pricing page and success page to match the rest of the app's design. Use clean, modern styling.`,
  promptFileName: 'replit-prompt.txt',
  footerNote:
    'After creating your product in the Simeon dashboard, you\u2019ll get a checkout link URL to replace the CHECKOUT_LINK_URL placeholder above.',
}

export const BOLT_INTEGRATION: PromptIntegration = {
  type: 'prompt',
  slug: 'bolt',
  name: 'Bolt',
  tagline: 'Build with Bolt. Monetize with Simeon.',
  description:
    'Simeon works seamlessly with Bolt-generated apps. Copy this prompt into Bolt to scaffold a complete pricing page with Simeon\u2019s checkout overlay \u2014 zero config required.',
  category: 'ai-builder',
  categoryLabel: 'AI App Builder',
  howItWorks: [
    { title: 'Copy prompt', description: 'Grab the ready-made prompt below' },
    {
      title: 'Paste in Bolt',
      description: 'Bolt builds your pricing page',
    },
    {
      title: 'Add checkout links',
      description: 'Drop in your Simeon URLs after creating products',
    },
  ],
  prompt: `Add Simeon payment checkout to my app. Simeon is my billing provider \u2014 it handles payments through a hosted checkout overlay. No API keys or environment variables needed in the frontend.

Here's how it works:
- Simeon uses checkout links (simple URLs) that open a secure payment overlay on top of your app
- No backend code, no API keys, no .env variables \u2014 just a script tag and links

Please do the following:

1. Add this script tag to index.html, right before the closing </body> tag:

<script defer data-auto-init src="https://cdn.simeonlabs.com/checkout/embed.js"></script>

2. Create a /pricing page with a clean layout showing plan cards. For each plan's call-to-action button, use an anchor tag like this:

<a href="CHECKOUT_LINK_URL" data-simeon-checkout data-simeon-checkout-theme="light">
  Get Started
</a>

Use "CHECKOUT_LINK_URL" as a placeholder \u2014 I'll replace it with my actual checkout link from the Simeon dashboard after I create my products there.

3. When a user clicks the button, Simeon's checkout overlay will open automatically (handled by the script). No onClick handler needed.

4. Create a /checkout/success page that displays a confirmation message after a successful purchase.

5. Style the pricing page and success page to match the rest of the app's design.`,
  promptFileName: 'bolt-prompt.txt',
  footerNote:
    'After creating your product in the Simeon dashboard, you\u2019ll get a checkout link URL to replace the CHECKOUT_LINK_URL placeholder above.',
}

export const BETTERAUTH_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'better-auth',
  name: 'BetterAuth',
  tagline: 'Authenticate with BetterAuth. Monetize with Simeon.',
  description:
    'The official Simeon plugin for BetterAuth gives you checkout, customer portal, usage-based billing, and webhooks \u2014 all wired into your auth layer.',
  category: 'auth',
  categoryLabel: 'Auth Framework',
  howItWorks: [
    {
      title: 'Install plugin',
      description: 'Add @simeon/better-auth to your project',
    },
    {
      title: 'Configure auth',
      description: 'Add the Simeon plugin to your BetterAuth config',
    },
    {
      title: 'Go live',
      description: 'Users get checkout, portal, and billing out of the box',
    },
  ],
  packages: 'better-auth @simeon/better-auth @spaire/sdk',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/better-auth',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { betterAuth } from "better-auth";
import { simeon, checkout, portal, usage, webhooks } from "@simeon/better-auth";
import { Simeon } from "@spaire/sdk";

const simeonClient = new Simeon({
  accessToken: process.env.SIMEON_ACCESS_TOKEN,
});

const auth = betterAuth({
  // ... your Better Auth config
  plugins: [
    simeon({
      client: simeonClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            { productId: "YOUR_PRODUCT_ID", slug: "pro" },
          ],
          successUrl: process.env.SIMEON_SUCCESS_URL,
          authenticatedUsersOnly: true,
        }),
      ],
    }),
  ],
});`,
}

export const EXPRESS_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'express',
  name: 'Express',
  tagline: 'Build with Express. Monetize with Simeon.',
  description:
    'Use the Simeon SDK in any Express or Node.js backend. Create checkouts, handle webhooks, and manage the full billing lifecycle with a few lines of code.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install SDK',
      description: 'Add @spaire/sdk to your project',
    },
    {
      title: 'Add routes',
      description: 'Checkout + webhook endpoints in Express',
    },
    {
      title: 'Go live',
      description: 'Full billing loop ready to deploy',
    },
  ],
  packages: '@spaire/sdk',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/typescript',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}
SIMEON_WEBHOOK_SECRET=your_webhook_secret`,
  code: `import express from "express";
import { Simeon } from "@spaire/sdk";

const app = express();
app.use(express.json());

const simeon = new Simeon({
  accessToken: process.env.SIMEON_ACCESS_TOKEN,
});

// Create a checkout session
app.post("/api/checkout", async (req, res) => {
  const checkout = await simeon.checkouts.create({
    products: [req.body.productId],
    successUrl: process.env.SIMEON_SUCCESS_URL,
  });
  res.json({ url: checkout.url });
});

// Handle webhooks
app.post("/api/webhooks/simeon", async (req, res) => {
  const event = req.body;

  if (event.type === "checkout.completed") {
    // Activate subscription or fulfill order
    console.log("Checkout completed:", event.data);
  }

  res.json({ received: true });
});

app.listen(3000);`,
}

export const PYTHON_SDK_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'python-sdk',
  name: 'Python SDK',
  tagline: 'Build with Python. Monetize with Simeon.',
  description:
    'The official Simeon Python SDK gives you a clean, type-safe interface to create checkouts, manage subscriptions, and handle webhooks \u2014 built for any Python web framework.',
  category: 'backend',
  categoryLabel: 'Backend SDK',
  howItWorks: [
    {
      title: 'Install SDK',
      description: 'Add simeon-sdk to your project',
    },
    {
      title: 'Configure credentials',
      description: 'Set your access token in the environment',
    },
    {
      title: 'Go live',
      description: 'Create checkouts and handle webhooks',
    },
  ],
  packages: 'simeon-sdk',
  pythonInstall: 'pip install simeon-sdk',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/python',
  codeLang: 'python',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import os
from simeon_sdk import Simeon

with Simeon(
    access_token=os.environ.get("SIMEON_ACCESS_TOKEN"),
) as simeon:

    res = simeon.checkouts.create(request={
        "products": [
            "YOUR_PRODUCT_ID"
        ],
        "success_url": os.environ.get("SIMEON_SUCCESS_URL")
    })

    # Handle response
    redirect(res.url)`,
}

export const PHP_SDK_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'php-sdk',
  name: 'PHP SDK',
  tagline: 'Build with PHP. Monetize with Simeon.',
  description:
    'The official Simeon PHP SDK gives you a clean, type-safe interface to create checkouts, manage subscriptions, and handle webhooks \u2014 built for any PHP application.',
  category: 'backend',
  categoryLabel: 'Backend SDK',
  howItWorks: [
    {
      title: 'Install SDK',
      description: 'Add simeon-tech/simeon-php via Composer',
    },
    {
      title: 'Configure credentials',
      description: 'Set your access token in the environment',
    },
    {
      title: 'Go live',
      description: 'Create checkouts and handle webhooks',
    },
  ],
  packages: 'simeon-tech/simeon-php',
  pythonInstall: 'composer require simeon-tech/simeon-php',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/php',
  codeLang: 'php',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `<?php

declare(strict_types=1);

require 'vendor/autoload.php';

use Simeon\\Simeon;

$sdk = Simeon::builder()
    ->setSecurity(getenv('SIMEON_ACCESS_TOKEN'))
    ->build();

$response = $sdk->checkouts->create([
    'products' => ['YOUR_PRODUCT_ID'],
    'success_url' => getenv('SIMEON_SUCCESS_URL'),
]);

// Redirect to checkout
header('Location: ' . $response->url);`,
}

export const TYPESCRIPT_SDK_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'typescript-sdk',
  name: 'TypeScript SDK',
  tagline: 'Build with TypeScript. Monetize with Simeon.',
  description:
    'The official Simeon TypeScript SDK gives you a clean, type-safe interface to create checkouts, manage subscriptions, and handle webhooks — built for any TypeScript or JavaScript runtime.',
  category: 'backend',
  categoryLabel: 'Backend SDK',
  howItWorks: [
    {
      title: 'Install SDK',
      description: 'Add @spaire/sdk to your project',
    },
    {
      title: 'Configure credentials',
      description: 'Set your access token in the environment',
    },
    {
      title: 'Go live',
      description: 'Create checkouts and handle webhooks',
    },
  ],
  packages: '@spaire/sdk',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/typescript',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Simeon } from "@spaire/sdk";

const simeon = new Simeon({
  accessToken: process.env.SIMEON_ACCESS_TOKEN,
});

const checkout = await simeon.checkouts.create({
  products: ["YOUR_PRODUCT_ID"],
  successUrl: process.env.SIMEON_SUCCESS_URL,
});

// Redirect to checkout
redirect(checkout.url);`,
}

export const RUBY_SDK_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'ruby-sdk',
  name: 'Ruby SDK',
  tagline: 'Build with Ruby. Monetize with Simeon.',
  description:
    'The official Simeon Ruby SDK gives you a clean interface to create checkouts, manage subscriptions, and handle webhooks — built for any Ruby application or framework.',
  category: 'backend',
  categoryLabel: 'Backend SDK',
  howItWorks: [
    {
      title: 'Install gem',
      description: 'Add simeon to your project via gem or Bundler',
    },
    {
      title: 'Configure credentials',
      description: 'Set your access token in the environment',
    },
    {
      title: 'Go live',
      description: 'Create checkouts and handle webhooks',
    },
  ],
  packages: 'simeon',
  pythonInstall: 'gem install simeon',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/ruby',
  codeLang: 'bash',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token`,
  code: `require 'simeon'

s = OpenApiSDK::Simeon.new(
  access_token: ENV['SIMEON_ACCESS_TOKEN']
)

res = s.checkouts.create(
  products: ['YOUR_PRODUCT_ID'],
  success_url: 'https://example.com/success'
)

# Redirect to checkout
redirect res.url`,
}

export const ASTRO_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'astro',
  name: 'Astro',
  tagline: 'Build with Astro. Monetize with Simeon.',
  description:
    'The official @simeon/astro adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/astro to your project',
    },
    {
      title: 'Add route handler',
      description: 'One-line checkout API route',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/astro',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/astro',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Checkout } from "@simeon/astro";
import { SIMEON_ACCESS_TOKEN, SIMEON_SUCCESS_URL } from "astro:env/server";

// src/pages/api/checkout.ts
export const GET = Checkout({
  accessToken: SIMEON_ACCESS_TOKEN,
  successUrl: SIMEON_SUCCESS_URL,
});`,
}

export const ELYSIA_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'elysia',
  name: 'Elysia',
  tagline: 'Build with Elysia. Monetize with Simeon.',
  description:
    'The official @simeon/elysia adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/elysia to your project',
    },
    {
      title: 'Add route handler',
      description: 'One-line checkout route',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/elysia',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/elysia',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Elysia } from "elysia";
import { Checkout } from "@simeon/elysia";

const app = new Elysia();

app.get(
  "/checkout",
  Checkout({
    accessToken: process.env.SIMEON_ACCESS_TOKEN!,
    successUrl: process.env.SIMEON_SUCCESS_URL!,
  })
);`,
}

export const FASTIFY_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'fastify',
  name: 'Fastify',
  tagline: 'Build with Fastify. Monetize with Simeon.',
  description:
    'The official @simeon/fastify adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/fastify to your project',
    },
    {
      title: 'Add route handler',
      description: 'One-line checkout route',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/fastify',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/fastify',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import fastify from "fastify";
import { Checkout } from "@simeon/fastify";

const app = fastify();

app.get(
  "/checkout",
  Checkout({
    accessToken: process.env.SIMEON_ACCESS_TOKEN!,
    successUrl: process.env.SIMEON_SUCCESS_URL!,
  })
);`,
}

export const HONO_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'hono',
  name: 'Hono',
  tagline: 'Build with Hono. Monetize with Simeon.',
  description:
    'The official @simeon/hono adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/hono to your project',
    },
    {
      title: 'Add route handler',
      description: 'One-line checkout route',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/hono',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/hono',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Hono } from "hono";
import { Checkout } from "@simeon/hono";

const app = new Hono();

app.get(
  "/checkout",
  Checkout({
    accessToken: process.env.SIMEON_ACCESS_TOKEN!,
    successUrl: process.env.SIMEON_SUCCESS_URL!,
  })
);`,
}

export const LARAVEL_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'laravel',
  name: 'Laravel',
  tagline: 'Build with Laravel. Monetize with Simeon.',
  description:
    'The official Laravel adapter for Simeon gives you checkout, subscriptions, customer portal, and webhooks — all integrated with Eloquent and your existing auth.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install package',
      description: 'Add laravel-simeon via Composer',
    },
    {
      title: 'Run installer',
      description: 'php artisan simeon:install sets up everything',
    },
    {
      title: 'Go live',
      description: 'Checkout, subscriptions, and webhooks ready',
    },
  ],
  packages: 'danestves/laravel-simeon',
  pythonInstall: 'composer require danestves/laravel-simeon',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/laravel',
  codeLang: 'php',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_WEBHOOK_SECRET=your_webhook_secret`,
  code: `<?php

use Illuminate\\Http\\Request;

// Add Billable trait to your User model
// use Danestves\\LaravelSimeon\\Billable;

Route::post('/checkout', function (Request $request) {
    return $request->user()->checkout(['product_id_123']);
});

Route::post('/subscribe', function (Request $request) {
    return $request->user()->subscribe('product_id_123');
});`,
}

export const NUXT_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'nuxt',
  name: 'Nuxt',
  tagline: 'Build with Nuxt. Monetize with Simeon.',
  description:
    'The official @simeon/nuxt module gives you checkout, customer portal, and webhooks out of the box — the full billing loop as a Nuxt module.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install module',
      description: 'Add @simeon/nuxt to your project',
    },
    {
      title: 'Register module',
      description: 'Add to your nuxt.config.ts modules array',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/nuxt',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/nuxt',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@simeon/nuxt"],
});

// server/routes/api/checkout.post.ts
import { Checkout } from "@simeon/nuxt";

export default defineEventHandler((event) => {
  return Checkout({
    accessToken: process.env.SIMEON_ACCESS_TOKEN!,
    successUrl: process.env.SIMEON_SUCCESS_URL!,
  })(event);
});`,
}

export const REMIX_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'remix',
  name: 'Remix',
  tagline: 'Build with Remix. Monetize with Simeon.',
  description:
    'The official @simeon/remix adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/remix to your project',
    },
    {
      title: 'Add loader',
      description: 'One-line checkout route loader',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/remix',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/remix',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Checkout } from "@simeon/remix";

// app/routes/checkout.tsx
export const loader = Checkout({
  accessToken: process.env.SIMEON_ACCESS_TOKEN!,
  successUrl: process.env.SIMEON_SUCCESS_URL!,
});`,
}

export const SVELTEKIT_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'sveltekit',
  name: 'SvelteKit',
  tagline: 'Build with SvelteKit. Monetize with Simeon.',
  description:
    'The official @simeon/sveltekit adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/sveltekit to your project',
    },
    {
      title: 'Add server route',
      description: 'One-line checkout endpoint',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/sveltekit',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/sveltekit',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Checkout } from "@simeon/sveltekit";

// src/routes/checkout/+server.ts
export const GET = Checkout({
  accessToken: process.env.SIMEON_ACCESS_TOKEN!,
  successUrl: process.env.SIMEON_SUCCESS_URL!,
});`,
}

export const TANSTACK_START_INTEGRATION: SdkIntegration = {
  type: 'sdk',
  slug: 'tanstack-start',
  name: 'TanStack Start',
  tagline: 'Build with TanStack Start. Monetize with Simeon.',
  description:
    'The official @simeon/tanstack-start adapter gives you checkout, customer portal, and webhooks out of the box — the full billing loop in a single package.',
  category: 'framework',
  categoryLabel: 'Framework',
  howItWorks: [
    {
      title: 'Install adapter',
      description: 'Add @simeon/tanstack-start to your project',
    },
    {
      title: 'Add file route',
      description: 'One-line checkout route handler',
    },
    {
      title: 'Go live',
      description: 'Checkout, portal, and webhooks ready',
    },
  ],
  packages: 'zod @simeon/tanstack-start',
  docsLink: 'https://docs.simeonlabs.com/integrate/sdk/adapters/tanstack-start',
  codeLang: 'typescript',
  envVars: `SIMEON_ACCESS_TOKEN=your_access_token
SIMEON_SUCCESS_URL=https://example.com/success?checkout_id={CHECKOUT_ID}`,
  code: `import { Checkout } from "@simeon/tanstack-start";
import { createFileRoute } from "@tanstack/react-start";

// routes/api/checkout.ts
export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      GET: Checkout({
        accessToken: process.env.SIMEON_ACCESS_TOKEN!,
        successUrl: process.env.SIMEON_SUCCESS_URL!,
      }),
    },
  },
});`,
}

export const ALL_INTEGRATIONS: Integration[] = [
  TYPESCRIPT_SDK_INTEGRATION,
  NEXTJS_INTEGRATION,
  RUBY_SDK_INTEGRATION,
  ASTRO_INTEGRATION,
  ELYSIA_INTEGRATION,
  FASTIFY_INTEGRATION,
  HONO_INTEGRATION,
  LARAVEL_INTEGRATION,
  NUXT_INTEGRATION,
  REMIX_INTEGRATION,
  SVELTEKIT_INTEGRATION,
  TANSTACK_START_INTEGRATION,
  SUPABASE_INTEGRATION,
  BETTERAUTH_INTEGRATION,
  EXPRESS_INTEGRATION,
  PYTHON_SDK_INTEGRATION,
  PHP_SDK_INTEGRATION,
]

export const getIntegrationBySlug = (slug: string): Integration | undefined => {
  return ALL_INTEGRATIONS.find((i) => i.slug === slug)
}
