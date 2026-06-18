import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundSettingsProvider, useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";
import { _resetSoundPrefsForTests, loadSoundPrefs } from "@/atlas/sound/soundPrefs";

function Probe() {
  const { calmMode, setCalmMode } = useSoundSettings();
  return (
    <button onClick={() => setCalmMode(!calmMode)}>{calmMode ? "calm-on" : "calm-off"}</button>
  );
}

describe("SoundSettingsProvider", () => {
  beforeEach(() => {
    _resetSoundPrefsForTests();
    document.documentElement.removeAttribute("data-calm");
  });

  it("starts from defaults and toggles calm mode, persisting + reflecting on <html>", () => {
    render(<SoundSettingsProvider><Probe /></SoundSettingsProvider>);
    expect(screen.getByRole("button").textContent).toBe("calm-off");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("calm-on");
    expect(document.documentElement.getAttribute("data-calm")).toBe("true");
    expect(loadSoundPrefs().calmMode).toBe(true);
  });
});
