import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Workspace } from './Workspace'

const container = document.getElementById('root')
if (!container) throw new Error('no #root')

createRoot(container).render(
  <StrictMode>
    <Workspace />
  </StrictMode>,
)
