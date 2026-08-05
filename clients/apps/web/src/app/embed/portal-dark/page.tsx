'use client'

// Static harness for the portal dark-mode CSS — renders the nav (tabs +
// search + icons), a short page with a course-card progress bar, all under
// .spaire-portal.sp-dark, importing the real portal.css. Verifies the
// dark overrides compute correctly (active tab text, search bg, progress
// track, full-height dark).

import '../../(main)/[organization]/portal/portal.css'

export default function PortalDarkEmbed() {
  return (
    <div className="spaire-portal sp-app sp-app--mobile-tabs sp-dark">
      <header className="sp-topbar" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 28px' }}>
        <nav className="sp-tabs" style={{ display: 'flex', gap: 6 }}>
          <a className="sp-tab is-active" href="#">Overview</a>
          <a className="sp-tab" href="#">Courses</a>
          <a className="sp-tab" href="#">Orders</a>
        </nav>
        <div className="sp-right">
          <label className="sp-search">
            <span>🔍</span>
            <input type="search" placeholder="Search…" aria-label="Search" />
          </label>
          <button className="sp-iconbtn" aria-label="x">●</button>
        </div>
      </header>
      <main className="sp-page">
        <div className="sp-route">
          <h1 className="sp-page-title">Courses</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
            <div className="sp-progress"><i style={{ width: '0%' }} /></div>
            <span className="sp-progress-pct">0%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <div className="sp-progress"><i style={{ width: '17%' }} /></div>
            <span className="sp-progress-pct">17%</span>
          </div>
        </div>
      </main>
    </div>
  )
}
