import { useState, useMemo } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useNotificationStore } from '@/stores/notification.store'
import type { Notification } from '@wawptn/types'

export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore()

  // Use unreadCount as animation key so the bell re-animates on each new notification
  const bellAnimationKey = useMemo(() => unreadCount, [unreadCount])

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
    const actionUrl = notification.metadata?.actionUrl as string | undefined
    if (actionUrl) {
      navigate(actionUrl)
    }
    setOpen(false)
  }

  const handleOpen = () => {
    setNow(Date.now())
    setOpen(!open)
  }

  const getTimeAgo = (dateStr: string) => {
    const diff = now - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('notifications.justNow')
    if (minutes < 60) return t('notifications.minutesAgo', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('notifications.hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    return t('notifications.daysAgo', { count: days })
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'vote_opened': return '🗳️'
      case 'vote_closed': return '🏆'
      case 'admin_broadcast': return '📢'
      default: return '🔔'
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center rounded-full hover:bg-white/[0.06] transition-colors p-2 -m-1 min-h-[44px] min-w-[44px]"
        aria-label={t('notifications.title')}
      >
        <motion.div
          key={bellAnimationKey}
          animate={{ rotate: [0, 12, -12, 8, -8, 0] }}
          transition={{ duration: 0.4 }}
        >
          <Bell className="w-5 h-5" />
        </motion.div>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              exit={{ scale: 0 }}
              className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-destructive rounded-full"
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] rounded-md border border-border bg-popover shadow-md overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium">{t('notifications.title')}</span>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    {t('notifications.markAllRead')}
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {t('notifications.empty')}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((notification, i) => (
                      <motion.button
                        key={notification.id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.15 }}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors flex gap-2.5 ${
                          !notification.read ? 'bg-accent/20' : ''
                        }`}
                      >
                        <span className="text-base mt-0.5 flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-tight ${!notification.read ? 'font-medium' : 'text-muted-foreground'}`}>
                            {notification.title}
                          </p>
                          {notification.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {notification.body}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {getTimeAgo(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                        )}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
