/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Azure Blob URL for real-time data.json — see azure-function/README.md. Optional. */
  readonly VITE_REALTIME_DATA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
