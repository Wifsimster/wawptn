const IN_APP_UA_PATTERNS: readonly RegExp[] = [
  /FBAN|FBAV|FB_IAB|FBIOS/i,
  /Instagram/i,
  /Twitter|TwitterAndroid/i,
  /Line\//i,
  /MicroMessenger/i,
  /DiscordBot|Discord\/[0-9]/i,
  /LinkedInApp/i,
  /TikTok|musical_ly|BytedanceWebview/i,
  /Snapchat/i,
  /KAKAOTALK/i,
  /Pinterest/i,
  /Reddit\//i,
]

export function isInAppBrowser(userAgent: string = navigator.userAgent): boolean {
  return IN_APP_UA_PATTERNS.some((re) => re.test(userAgent))
}

export type MobileOS = 'ios' | 'android' | 'other'

export function detectMobileOS(userAgent: string = navigator.userAgent): MobileOS {
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios'
  if (/Macintosh/.test(userAgent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) {
    return 'ios'
  }
  if (/Android/i.test(userAgent)) return 'android'
  return 'other'
}
