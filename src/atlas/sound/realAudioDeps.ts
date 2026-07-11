import type { AudioDeps } from "@/atlas/sound/AudioEngine";

export const realAudioDeps: AudioDeps = {
  createContext: () => new (window.AudioContext || (window as any).webkitAudioContext)(),
  fetchAudio: (url) => fetch(url).then((r) => r.arrayBuffer()),
  canPlay: (src) => {
    if (!src.endsWith(".ogg")) return true;
    try {
      return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== "";
    } catch {
      return false;
    }
  },
};
