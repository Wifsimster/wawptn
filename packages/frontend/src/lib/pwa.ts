/**
 * Progressive Web App helpers: native notification permission, native
 * notification delivery via the registered service worker, and the
 * `beforeinstallprompt` capture for "install to home screen" UX.
 *
 * The service worker itself is registered automatically by vite-plugin-pwa
 * (`registerType: 'autoUpdate'` in vite.config.ts). This module is a thin
 * wrapper over the browser APIs — it never installs its own SW.
 */

/** Whether the current browser supports the Notification API at all. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

/** Current permission state, or 'unsupported' when the browser has no Notification API. */
export type NotificationPermissionState = NotificationPermission | 'unsupported'

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Prompt the user for notification permission. Returns the resulting
 * permission state. Safe to call when permission is already granted or
 * denied — the browser will short-circuit without re-prompting.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    const result = await Notification.requestPermission()
    return result
  } catch {
    return 'default'
  }
}

interface NativeNotificationOptions {
  /** Short body text. Keep it under ~120 characters for mobile OS display. */
  body?: string
  /** URL of an icon (uses the PWA icon by default if omitted). */
  icon?: string
  /** Opaque tag — reusing a tag replaces the previous notification with
   * the same tag, so bursts of events (e.g. multiple incoming votes)
   * don't bury the notification tray. */
  tag?: string
  /** Arbitrary data payload the notification click handler can read. */
  data?: Record<string, unknown>
  /** `true` to require explicit dismissal, `false` to auto-dismiss. */
  requireInteraction?: boolean
}

/**
 * Show a native OS notification via the registered service worker.
 *
 * Returns `false` when the browser doesn't support notifications, the user
 * hasn't granted permission, or the service worker isn't ready yet — the
 * caller should keep rendering its in-app fallback UI in that case.
 */
export async function showNativeNotification(
  title: string,
  options: NativeNotificationOptions = {},
): Promise<boolean> {
  if (!isNotificationSupported()) return false
  if (Notification.permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, {
      body: options.body,
      icon: options.icon ?? '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: options.tag,
      data: options.data,
      requireInteraction: options.requireInteraction ?? false,
    })
    return true
  } catch {
    // Any failure (SW not ready, permission flipped to denied between the
    // check and the call, browser quirk) is swallowed — the caller has
    // already delivered the in-app notification so nothing is lost.
    return false
  }
}

// ─── Install prompt ─────────────────────────────────────────────────────────

/**
 * Minimal shape of the non-standard `BeforeInstallPromptEvent`. TypeScript's
 * lib.dom doesn't expose it, so we define what we actually use.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let capturedInstallEvent: BeforeInstallPromptEvent | null = null
const installListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>()

/**
 * Install a one-time listener on `beforeinstallprompt` that captures the
 * event and broadcasts it to subscribers. Must be called once at app
 * startup (e.g. from `usePwaInstallPrompt`). Safe to call multiple times —
 * only the first call wires the DOM listener.
 */
let wired = false
export function installBeforeInstallPromptCapture(): void {
  if (wired) return
  wired = true
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    // Stop Chrome's default mini-infobar so we can surface our own UI
    event.preventDefault()
    capturedInstallEvent = event as unknown as BeforeInstallPromptEvent
    for (const listener of installListeners) {
      listener(capturedInstallEvent)
    }
  })
  window.addEventListener('appinstalled', () => {
    capturedInstallEvent = null
    for (const listener of installListeners) {
      listener(null)
    }
  })
}

export function getCapturedInstallEvent(): BeforeInstallPromptEvent | null {
  return capturedInstallEvent
}

export function subscribeToInstallPrompt(
  listener: (event: BeforeInstallPromptEvent | null) => void,
): () => void {
  installListeners.add(listener)
  return () => {
    installListeners.delete(listener)
  }
}

/** Fire the browser's native install prompt. Returns the user's choice. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!capturedInstallEvent) return 'unavailable'
  try {
    await capturedInstallEvent.prompt()
    const choice = await capturedInstallEvent.userChoice
    capturedInstallEvent = null
    return choice.outcome
  } catch {
    return 'dismissed'
  }
}
