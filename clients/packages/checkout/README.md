# `@simeon/checkout`

JavaScript utilities for integrating Simeon Checkout into your website or application.

## Installation

```bash
pnpm add @simeon/checkout
# or
npm install @simeon/checkout
```

## Embed Script (Recommended)

The easiest way to add checkout is via the CDN embed script. Add it to your HTML layout:

```html
<script
  defer
  data-auto-init
  src="https://cdn.simeonlabs.com/checkout/embed.js"
></script>
```

Then add checkout links with `data-simeon-checkout`:

```html
<a
  href="https://buy.simeonlabs.com/simeon_cl_YOUR_LINK_ID"
  data-simeon-checkout
  data-simeon-checkout-theme="light"
>
  Get Started
</a>
```

The overlay opens automatically on click, and closes automatically on success.

## Programmatic API

Use `window.Simeon.EmbedCheckout.create()` to open checkout from JavaScript:

```typescript
// After the embed script has loaded
const checkout = await window.Simeon.EmbedCheckout.create(
  'https://buy.simeonlabs.com/simeon_cl_YOUR_LINK_ID',
  { theme: 'light' },
)
```

`create()` returns a Promise that resolves when the overlay is fully loaded, or rejects after 30 seconds if it fails to load.

### TypeScript

The embed script exposes `window.Simeon.EmbedCheckout`. To get types, import from this package:

```typescript
import type { SimeonEmbedCheckout } from '@simeon/checkout'
```

Or declare it yourself:

```typescript
declare global {
  interface Window {
    Simeon: {
      EmbedCheckout: {
        create: (
          url: string,
          options?: { theme?: 'light' | 'dark' },
        ) => Promise<void>
        init: () => void
      }
    }
  }
}
```

## Events

You can listen to checkout lifecycle events:

```typescript
const checkout = await window.Simeon.EmbedCheckout.create(url)

checkout.addEventListener('confirmed', () => {
  // Payment confirmed — do not close the overlay
})

checkout.addEventListener('success', (event) => {
  // Checkout completed successfully
  console.log('Success URL:', event.detail.successURL)
})
```

| Event       | When it fires                            |
| ----------- | ---------------------------------------- |
| `loaded`    | Overlay is fully loaded                  |
| `confirmed` | Payment confirmed (card charged)         |
| `success`   | Checkout completed — overlay auto-closes |
| `close`     | User dismissed the overlay               |

## Timeout & Error Handling

`create()` rejects after **30 seconds** if the checkout does not load. Handle the error:

```typescript
try {
  await window.Simeon.EmbedCheckout.create(url)
} catch (err) {
  console.error(err) // '[Simeon Checkout] Checkout failed to load within 30 seconds'
}
```

The auto-init click handler (via `data-simeon-checkout`) logs errors to the console automatically.

## Next.js

```typescript
import Script from 'next/script'

// In your root layout.tsx
<Script
  defer
  data-auto-init
  src="https://cdn.simeonlabs.com/checkout/embed.js"
  strategy="afterInteractive"
/>
```

Make sure your CSP includes:

- `script-src`: `https://cdn.simeonlabs.com`
- `frame-src`: `https://buy.simeonlabs.com`
