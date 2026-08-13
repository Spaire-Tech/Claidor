/**
 * Where the panel starts.
 *
 * Two things happen before anything renders, and both have to, in order:
 * Office says which application this is, and the panel asks the server
 * which document it is sitting in. Everything on screen depends on the
 * second answer, which is why it is done here once rather than inside a
 * component that might mount twice.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Panel } from './Panel'
import { ready } from './host'
import './panel.css'

const container = document.getElementById('root')
if (!container)
  throw new Error('no #root — index.html was not the page that loaded')

// `ready()` resolves outside Office too, with a bridge that answers « not
// in Office » to everything. The panel is a web page and most of it gets
// built in a browser; refusing to render there would mean sideloading into
// PowerPoint to change a margin.
ready().then((bridge) => {
  createRoot(container).render(
    <StrictMode>
      <Panel bridge={bridge} />
    </StrictMode>,
  )
})
