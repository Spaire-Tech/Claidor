/** The Simeon mark (the brand's cloud) with the name beside it. */
export function CloudMark({ size = 32, color = "url(#simeon-cloud)" }: { readonly size?: number; readonly color?: string }) {
  return (
    <svg className="cloud-mark" width={size} height={size * 0.8} viewBox="0 0 40 32" aria-hidden="true">
      <defs>
        <linearGradient id="simeon-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f7fbf" />
          <stop offset="1" stopColor="#6fc6b8" />
        </linearGradient>
      </defs>
      <path d="M11 29c-4.6 0-8-3.3-8-7.6 0-3.7 2.6-6.8 6.1-7.4C10 8.6 14.5 4 20 4c5.1 0 9.3 3.8 10.3 8.8 3.8.5 6.7 3.7 6.7 7.6 0 4.7-3.6 8.6-8.4 8.6H11z" fill={color} />
      <circle cx="15.5" cy="19" r="2.1" fill="#fff" opacity="0.9" />
      <circle cx="24.5" cy="19" r="2.1" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function Wordmark({ size = 40 }: { readonly size?: number }) {
  return (
    <div className="wordmark" style={{ fontSize: size }}>
      <CloudMark size={size * 1.15} />
      <span className="wordmark__name">Simeon</span>
    </div>
  );
}
