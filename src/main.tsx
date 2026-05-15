import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/globals.css'
import { testSimpleMoveCategoria } from './debug/testSimpleMoveCategoria'

declare global {
  interface Window {
    /** Solo dev: UPDATE mínimo a gastos para aislar uuid "0". */
    testSimpleMoveCategoria?: typeof testSimpleMoveCategoria
  }
}

if (import.meta.env.DEV) {
  window.testSimpleMoveCategoria = testSimpleMoveCategoria
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
