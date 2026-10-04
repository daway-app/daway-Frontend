/// <reference types="vite/client" />

/**
 * Ambient types for the Vite environment variables this app consumes.
 * Adding a variable here keeps `import.meta.env` fully typed.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
