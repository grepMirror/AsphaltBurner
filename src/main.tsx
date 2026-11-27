import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import 'leaflet/dist/leaflet.css'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Production only: the install-only worker is not needed on the dev server.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
}
