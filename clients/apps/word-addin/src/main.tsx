import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Panel } from './panel'
import './styles.css'
import { WordUnavailable, ready } from './word'

const root = createRoot(document.getElementById('root')!)

ready().then(
  () => root.render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  ),
  (error: unknown) => {
    // Rendering the panel before Office is ready produces an add-in that
    // looks alive and cannot read the document. Saying why is better.
    const message =
      error instanceof WordUnavailable
        ? error.message
        : 'Office did not start. Close and reopen the pane.'
    root.render(<p className="notice error">{message}</p>)
  },
)
