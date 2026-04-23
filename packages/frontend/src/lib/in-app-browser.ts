/**
 * In-app browser detection.
 *
 * Social apps (Instagram, Messenger, Discord, TikTok, X, LinkedIn, Line,
 * WeChat) open links inside sandboxed webviews that reject the third-party
 * cookie round-trip Steam's OpenID 2.0 flow depends on. Inviting someone
 * via SMS works; inviting them via Instagram silently fails after the
 * Steam login redirect.
 *
 * Detection is heuristic — user agents lie, webviews vary across OS
 * versions. We err on the side of false positives: a noisy "open in
 * Safari/Chrome" prompt for a fringe browser is much better than a silent
 * broken login in the 95th-percentile case.
 */
const IN_APP_UA_PATTERNS: readonly RegExp[] = [
  /FBAN|FBAV|FB_IAB|FBIOS/i,   // Facebook / Messenger
  /Instagram/i,                  // Instagram
  /Twitter|TwitterAndroid/i,     // X / Twitter
  /Line\//i,                     // Line
  /MicroMessenger/i,             // WeChat
  /DiscordBot|Discord\/[0-9]/i,  // Discord in-app link preview
  /LinkedInApp/i,                // LinkedIn
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
  // Modern iPads identify as Mac; fall back to touch capability check.
  if (/Macintosh/.test(userAgent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) {
    return 'ios'
  }
  if (/Android/i.test(userAgent)) return 'android'
  return 'other'
}
