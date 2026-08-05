# `@spaire/checkout`

JavaScript utilities for integrating Spaire Checkout into your website or application.

## Installation

```bash
pnpm add @spaire/checkout
# or
npm install @spaire/checkout
```

## Embed Script (Recommended)

The easiest way to add checkout is via the CDN embed script. Add it to your HTML layout:

```html
<script defer data-auto-init src="https://cdn.spairehq.com/checkout/embed.js"></script>
```

Then add checkout links with `data-spaire-checkout`:

```html
<a
  href="https://buy.spairehq.com/spaire_cl_YOUR_LINK_ID"
  data-spaire-checkout
  data-spaire-checkout-theme="light"
>
  Get Started
</a>
```

The overlay opens automatically on click, and closes automatically on success.

## Programmatic API

Use `window.Spaire.EmbedCheckout.create()` to open checkout from JavaScript:

```typescript
// After the embed script has loaded
const checkout = await window.Spaire.EmbedCheckout.create(
  'https://buy.spairehq.com/spaire_cl_YOUR_LINK_ID',
  { theme: 'light' },
)
```

`create()` returns a Promise that resolves when the overlay is fully loaded, or rejects after 30 seconds if it fails to load.

### TypeScript

The embed script exposes `window.Spaire.EmbedCheckout`. To get types, import from this package:

```typescript
import type { SpaireEmbedCheckout } from '@spaire/checkout'
```

Or declare it yourself:

```typescript
declare global {
  interface Window {
    Spaire: {
      EmbedCheckout: {
        create: (url: string, options?: { theme?: 'light' | 'dark' }) => Promise<void>
        init: () => void
      }
    }
  }
}
```

## Events

You can listen to checkout lifecycle events:

```typescript
const checkout = await window.Spaire.EmbedCheckout.create(url)

checkout.addEventListener('confirmed', () => {
  // Payment confirmed — do not close the overlay
})

checkout.addEventListener('success', (event) => {
  // Checkout completed successfully
  console.log('Success URL:', event.detail.successURL)
})
```

| Event | When it fires |
|-------|--------------|
| `loaded` | Overlay is fully loaded |
| `confirmed` | Payment confirmed (card charged) |
| `success` | Checkout completed — overlay auto-closes |
| `close` | User dismissed the overlay |

## Timeout & Error Handling

`create()` rejects after **30 seconds** if the checkout does not load. Handle the error:

```typescript
try {
  await window.Spaire.EmbedCheckout.create(url)
} catch (err) {
  console.error(err) // '[Spaire Checkout] Checkout failed to load within 30 seconds'
}
```

The auto-init click handler (via `data-spaire-checkout`) logs errors to the console automatically.

## Next.js

```typescript
import Script from 'next/script'

// In your root layout.tsx
<Script
  defer
  data-auto-init
  src="https://cdn.spairehq.com/checkout/embed.js"
  strategy="afterInteractive"
/>
```

Make sure your CSP includes:
- `script-src`: `https://cdn.spairehq.com`
- `frame-src`: `https://buy.spairehq.com`
