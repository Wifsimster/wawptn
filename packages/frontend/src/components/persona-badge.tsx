import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { api } from '@/lib/api'

interface PersonaData {
  id?: string
  name: string
  embedColor: number
  introMessage: string
}

function colorIntToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

interface PersonaBadgeProps {
  /**
   * Group identifier for the per-group "persona du jour". When omitted,
   * the badge falls back to the deprecated global persona endpoint —
   * used only on screens without a group context (e.g. landing page).
   */
  groupId?: string
  /**
   * Pre-fetched persona. When provided the component skips its own
   * network call — lets the groups list pass the enriched `todayPersona`
   * field down without any extra round-trip.
   */
  persona?: PersonaData | null
  /**
   * `hero` renders the dominant full-width card with the intro message,
   * `compact` renders an inline one-line chip suitable for GroupCard.
   */
  variant?: 'hero' | 'compact'
  className?: string
}

/**
 * Daily persona greeting card — now scoped per-group.
 *
 * Displays the group's rotating bot persona with its name and (in hero
 * variant) full intro message. Each group has its own deterministic
 * daily pick from the shared persona pool, so two users looking at two
 * different groups on the same day will usually see different personas.
 */
export function PersonaBadge({ groupId, persona: initialPersona, variant = 'hero', className }: PersonaBadgeProps) {
  const { t } = useTranslation()
  const [fetched, setFetched] = useState<PersonaData | null>(null)

  useEffect(() => {
    // Parent already supplied the persona (list enrichment) — skip fetch.
    if (initialPersona) return
    let cancelled = false
    const run = async () => {
      try {
        if (groupId) {
          const result = await api.getGroupPersona(groupId)
          if (!cancelled) setFetched(result.persona)
        } else {
          const result = await api.getCurrentPersona()
          if (!cancelled) setFetched(result)
        }
      } catch {
        /* swallow — persona is a nice-to-have, not critical */
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [groupId, initialPersona])

  // Prop wins over locally fetched state so the list-enriched path (and
  // real-time `persona:changed` socket updates) always reflects the latest.
  const persona = initialPersona ?? fetched
  if (!persona) return null

  const color = colorIntToHex(persona.embedColor)

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] font-medium ${className ?? ''}`}
        style={{
          backgroundColor: `${color}14`,
          color,
          borderColor: `${color}33`,
        }}
        aria-label={t('persona.todayGroup')}
        title={persona.introMessage}
      >
        <Sparkles className="w-3 h-3" />
        <span className="truncate max-w-[140px]">{persona.name}</span>
      </span>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label={t('persona.todayGroup')}
      className={`relative overflow-hidden rounded-lg border border-white/[0.06] bg-card/40 p-4 mb-6 ${className ?? ''}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: `${color}26`, color }}
          aria-hidden="true"
        >
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              {groupId ? t('persona.todayGroup') : t('persona.today')}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-sm font-semibold truncate" style={{ color }}>
              {persona.name}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {persona.introMessage}
          </p>
        </div>
      </div>
    </motion.section>
  )
}
