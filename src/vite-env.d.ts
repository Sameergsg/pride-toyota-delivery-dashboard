/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Azure Blob URL for real-time data.json — see azure-function/README.md. Optional. */
  readonly VITE_REALTIME_DATA_URL?: string;

  /**
   * Primary real-time path: browser-side Microsoft sign-in (MSAL) +
   * direct Graph reads. All three below are public identifiers, not
   * secrets — safe to bake into the client bundle. See SETUP.md.
   */
  readonly VITE_AZURE_CLIENT_ID?: string;
  readonly VITE_AZURE_TENANT_ID?: string;
  readonly VITE_SHAREPOINT_SHARE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
