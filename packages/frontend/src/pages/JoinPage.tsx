import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, Copy, Gamepad2, Loader2, Trophy, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import type { InvitePreview } from '@wawptn/types'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { detectMobileOS, isInAppBrowser } from '@/lib/in-app-browser'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

export function JoinPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('join.title', 'Rejoindre un groupe'))
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  // Users who tap "Try anyway" after the warning fall through to the normal
  // Steam button. Most of the time the login still fails in the webview,
  // but we owe them the escape hatch rather than hard-locking the flow.
  const [overrideInAppBrowser, setOverrideInAppBrowser] = useState(false)
  const inAppBrowser = typeof navigator !== 'undefined' && isInAppBrowser()
  const mobileOS = typeof navigator !== 'undefined' ? detectMobileOS() : 'other'
  const joining = !!user && !!token && !error

  // Fetch invite preview (public, no auth needed)
  useEffect(() => {
    if (!token) return
    let cancelled = false

    api.getInvitePreview(token)
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch(() => {
        // Preview is best-effort, don't block the page
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!user || !token) return
    let cancelled = false

    api.joinGroup(token).then(
      (result) => {
        if (cancelled) return
        toast.success(t('joinGroup.success'))
        navigate(`/groups/${result.id}`)
      },
      (err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('joinGroup.error'))
      }
    )

    return () => { cancelled = true }
  }, [user, token, navigate, t])

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <motion.div
          className="flex flex-col items-center w-full max-w-md"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp}>
            <Gamepad2 className="w-12 h-12 text-primary mb-4" />
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2">
            {t('join.invited')}
          </motion.h1>

          {/* Group name & member info from preview */}
          {!previewLoading && preview?.isValid && (
            <motion.div variants={fadeUp} className="flex flex-col items-center mb-6 w-full">
              <p className="text-lg font-semibold text-foreground mb-2">{preview.groupName}</p>

              {/* Member avatars & count */}
              <div className="flex items-center gap-2 mb-4">
                {preview.memberAvatars.length > 0 && (
                  <div className="flex -space-x-2">
                    {preview.memberAvatars.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="w-8 h-8 rounded-full border-2 border-background"
                      />
                    ))}
                  </div>
                )}
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {t('join.memberCount', { count: preview.memberCount })}
                </span>
              </div>

              {/* Recent winner */}
              {preview.recentWinner && (
                <Card className="w-full p-3 mb-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-reward shrink-0" />
                    <div className="flex items-center gap-3 min-w-0">
                      {preview.recentWinner.headerImageUrl && (
                        <img
                          src={preview.recentWinner.headerImageUrl}
                          alt={preview.recentWinner.gameName}
                          className="w-16 h-8 rounded object-cover shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t('join.lastPlayed')}</p>
                        <p className="text-sm font-medium truncate">{preview.recentWinner.gameName}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Top 3 popular games */}
              {preview.topGames.length > 0 && (
                <div className="w-full">
                  <p className="text-xs text-muted-foreground mb-2">{t('join.popularGames')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {preview.topGames.map((game) => (
                      <Card key={game.gameName} className="p-2 flex flex-col items-center gap-1.5">
                        {game.headerImageUrl ? (
                          <img
                            src={game.headerImageUrl}
                            alt={game.gameName}
                            className="w-full aspect-[460/215] rounded object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-[460/215] rounded bg-muted flex items-center justify-center">
                            <Gamepad2 className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-xs text-center font-medium leading-tight line-clamp-2">{game.gameName}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Fallback prompt when no preview or invalid */}
          {!previewLoading && (!preview || !preview.isValid) && (
            <motion.p variants={fadeUp} className="text-muted-foreground mb-6">
              {t('join.loginPrompt')}
            </motion.p>
          )}

          {/* Simple prompt when preview is valid but no rich data */}
          {!previewLoading && preview?.isValid && !preview.recentWinner && preview.topGames.length === 0 && preview.memberAvatars.length === 0 && (
            <motion.p variants={fadeUp} className="text-muted-foreground mb-2">
              {t('join.loginPrompt')}
            </motion.p>
          )}

          {/* Loading state for preview */}
          {previewLoading && (
            <motion.p variants={fadeUp} className="text-muted-foreground mb-6">
              {t('join.loginPrompt')}
            </motion.p>
          )}

          {inAppBrowser && !overrideInAppBrowser ? (
            <motion.div variants={fadeUp} className="w-full">
              <Card className="p-4 mb-4 border-amber-500/40 bg-amber-500/5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold mb-1">{t('join.inAppBrowserTitle')}</p>
                    <p className="text-sm text-muted-foreground mb-2">{t('join.inAppBrowserBody')}</p>
                    <p className="text-sm text-muted-foreground">
                      {mobileOS === 'ios'
                        ? t('join.inAppBrowserIos')
                        : mobileOS === 'android'
                          ? t('join.inAppBrowserAndroid')
                          : null}
                    </p>
                  </div>
                </div>
              </Card>
              <div className="flex flex-col gap-2 w-full">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    const url = window.location.href
                    // Clipboard API isn't available on every in-app webview.
                    // When it isn't, fall back to a visible toast with the
                    // URL so the user can long-press and copy manually.
                    navigator.clipboard
                      ?.writeText(url)
                      .then(() => toast.success(t('join.copyLinkSuccess')))
                      .catch(() => toast.info(url))
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('join.copyLink')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverrideInAppBrowser(true)}
                >
                  {t('join.openAnyway')}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp}>
              <Button variant="steam" size="lg" asChild>
                <a href={`/api/auth/steam/login?returnTo=/join/${token}`}>{t('login.signIn')}</a>
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>
    )
  }

  if (joining) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{t('join.connecting')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold mb-2 text-destructive">{t('join.failed')}</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => navigate('/')}>{t('join.goToGroups')}</Button>
      </div>
    )
  }

  return null
}
