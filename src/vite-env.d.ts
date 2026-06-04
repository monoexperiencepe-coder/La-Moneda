/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_EMPRESA_ID: string;
  readonly VITE_OPERADOR_EMAIL?: string;
  readonly VITE_AI_FOCUS_DEBUG?: string;
  readonly VITE_DATA_QUALITY_TOOLS?: string;
  readonly VITE_VERBOSE_DEBUG?: string;
  readonly VITE_COPILOT_STRICT_FACT_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
