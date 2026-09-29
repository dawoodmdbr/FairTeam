/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ORGANIZER_USERNAME?: string;
  readonly VITE_ORGANIZER_PASSWORD?: string;
  readonly SESSION_EXPIRY_DAYS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
