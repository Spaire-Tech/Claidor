import DOMPurify from 'dompurify'

/**
 * Sanitize email HTML for safe in-dashboard preview rendering.
 *
 * The HTML being rendered here is authored by org admins and rendered by the
 * backend's email renderer. We trust the backend to escape user-input strings
 * inside blocks, but we do NOT trust the resulting document to be free of
 * collaborator-supplied scripts or styles when surfacing it in *another*
 * collaborator's dashboard. So we run it through DOMPurify before injecting.
 *
 * Note: this is for dashboard preview only. The email itself is sent as-is to
 * the recipient, where Gmail/Outlook/etc apply their own sanitization at
 * delivery time.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return ''

  // SSR safety: DOMPurify needs a window. Next.js server components may
  // try to render previews; in that case we strip everything aggressively
  // and let the client re-hydrate with the real DOM-based sanitizer.
  if (typeof window === 'undefined') {
    return ''
  }

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // Email HTML uses <style>, <table>, etc. heavily — keep them.
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
  })
}
