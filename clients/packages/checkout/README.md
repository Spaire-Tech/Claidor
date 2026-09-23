# `@claidor/checkout`

JavaScript utilities for integrating Simeon Checkout into your website or application.

## Installation

```bash
pnpm add @claidor/checkout
# or
npm install @claidor/checkout
```

## Embed Script (Recommended)

The easiest way to add checkout is via the CDN embed script. Add it to your HTML layout:

```html
<script defer data-auto-init src="https://cdn.claidorhq.com/checkout/embed.js"></script>
```

Then add checkout links with `data-claidor-checkout`:

```html
<a
  href="https://buy.claidorhq.com/claidor_cl_YOUR_LINK_ID"
  data-claidor-checkout
  data-claidor-checkout-theme="light"
>
  Get Started
</a>
```

The overlay opens automatically on click, and closes automatically on success.

## Programmatic API

Use `window.Claidor.EmbedCheckout.create()` to open checkout from JavaScript:

```typescript
// After the embed script has loaded
const checkout = await window.Claidor.EmbedCheckout.create(
  'https://buy.claidorhq.com/claidor_cl_YOUR_LINK_ID',
  { theme: 'light' },
)
```

`create()` returns a Promise that resolves when the overlay is fully loaded, or rejects after 30 seconds if it fails to load.

### TypeScript

The embed script exposes `window.Claidor.EmbedCheckout`. To get types, import from this package:

```typescript
import type { ClaidorEmbedCheckout } from '@claidor/checkout'
```

Or declare it yourself:

```typescript
declare global {
  interface Window {
    Claidor: {
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
const checkout = await window.Claidor.EmbedCheckout.create(url)

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
  await window.Claidor.EmbedCheckout.create(url)
} catch (err) {
  console.error(err) // '[Claidor Checkout] Checkout failed to load within 30 seconds'
}
```

The auto-init click handler (via `data-claidor-checkout`) logs errors to the console automatically.

## Next.js

```typescript
import Script from 'next/script'

// In your root layout.tsx
<Script
  defer
  data-auto-init
  src="https://cdn.claidorhq.com/checkout/embed.js"
  strategy="afterInteractive"
/>
```

Make sure your CSP includes:
- `script-src`: `https://cdn.claidorhq.com`
- `frame-src`: `https://buy.claidorhq.com`
