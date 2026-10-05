// Talks to the ghost-cursor extension. The extension's bridge (runs only on this app's origins)
//  - marks the page: <html data-aiwb-ext="<version>">, so we can tell it is installed;
//  - listens on window for the event "aiwb:guide" to start or end a guided session.
// Contract: window.dispatchEvent(new CustomEvent("aiwb:guide", { detail: JSON.stringify({ on, account, api?, voice?, cloneId? }) }))
// api/voice/cloneId only shape how the guide's voice sounds (see ghost-cursor-extension/voice.js).
// Pure with an injectable event target / root so it runs under `node --test`.

export type EventTargetLike = { dispatchEvent: (e: Event) => boolean }

// `account` is the lab's account name and is REQUIRED for "on" (the extension ignores an "on" without it).
export type GuideVoice = { api: string; voice: number; cloneId: string | null }
export function armGuide(on: boolean, account: string, target: EventTargetLike = window, voice?: GuideVoice): void {
  target.dispatchEvent(new CustomEvent('aiwb:guide', { detail: JSON.stringify({ on, account, ...voice }) }))
}

// null when the extension is not installed (or this page was loaded before it was installed).
export function extensionVersion(root: { dataset: Record<string, string | undefined> } = document.documentElement): string | null {
  return root.dataset.aiwbExt ?? null
}
