import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureTablesLoaded } from './data/tables.ts'
import { requestPersistence } from './pwa/storage.ts'
import { reloadWhenFilesAreStale } from './staleVersion.ts'

// A page left open across an update reloads into the new version when it needs a file that's gone.
reloadWhenFilesAreStale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Bundled food tables go into IndexedDB on first launch (and again when they are updated).
ensureTablesLoaded().catch((error: unknown) => console.error('Could not load the food tables', error))

// Ask the browser to keep the data. On iPhone this is granted to Home Screen apps.
void requestPersistence()
