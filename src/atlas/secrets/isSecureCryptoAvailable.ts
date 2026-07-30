/** Web Crypto (`crypto.subtle`) is only exposed in a secure context (https, or localhost). */
export function isSecureCryptoAvailable(): boolean {
  return window.isSecureContext && !!globalThis.crypto?.subtle;
}
