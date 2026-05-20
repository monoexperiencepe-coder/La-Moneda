/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_EMPRESA_ID: string;
  readonly VITE_OPERADOR_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
