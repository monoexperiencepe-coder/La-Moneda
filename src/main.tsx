import React from 'react'
import ReactDOM from 'react-dom/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import App from './App.tsx'
import './styles/globals.css'
import { testSimpleMoveCategoria } from './debug/testSimpleMoveCategoria'
import { supabase } from './lib/supabase'

declare global {
  interface Window {
    /** Solo dev: UPDATE mínimo a gastos para aislar uuid "0". */
    testSimpleMoveCategoria?: typeof testSimpleMoveCategoria
    /** Solo dev: cliente anon (misma sesión JWT) para pruebas RLS en DevTools. */
    supabase?: SupabaseClient
  }
}

if (import.meta.env.DEV) {
  window.testSimpleMoveCategoria = testSimpleMoveCategoria
  window.supabase = supabase
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
