import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// SEC: clickjacking guard. GitHub Pages can't send X-Frame-Options and a
// meta-CSP can't express frame-ancestors, so bust out of any cross-origin
// frame. Bundled, so script-src 'self' permits it.
if (window.top !== window.self) {
  try { window.top.location = window.self.location } catch { /* cross-origin frame: best effort */ }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
