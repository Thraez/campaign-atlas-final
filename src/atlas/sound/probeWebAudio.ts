/** Returns true if the Web Audio API is available in this environment. */
export function isWebAudioAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
  );
}
