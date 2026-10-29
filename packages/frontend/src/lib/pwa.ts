function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

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
  body?: string
  icon?: string
  tag?: string
  data?: Record<string, unknown>
  requireInteraction?: boolean
}

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
    return false
  }
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let capturedInstallEvent: BeforeInstallPromptEvent | null = null
const installListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>()

let wired = false
export function installBeforeInstallPromptCapture(): void {
  if (wired) return
  wired = true
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
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

export function subscribeToInstallPrompt(
  listener: (event: BeforeInstallPromptEvent | null) => void,
): () => void {
  installListeners.add(listener)
  return () => {
    installListeners.delete(listener)
  }
}

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
