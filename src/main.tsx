import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureTablesLoaded } from './data/tables.ts'
import { requestPersistence } from './pwa/storage.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Bundled food tables go into IndexedDB on first launch (and again when they are updated).
ensureTablesLoaded().catch((error: unknown) => console.error('Could not load the food tables', error))

// Ask the browser to keep the data. On iPhone this is granted to Home Screen apps.
void requestPersistence()
