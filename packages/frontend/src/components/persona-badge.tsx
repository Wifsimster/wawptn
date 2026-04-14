import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { api } from '@/lib/api'

interface PersonaData {
  name: string
  embedColor: number
  introMessage: string
}

function colorIntToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

/**
 * Daily persona greeting card.
 *
 * Displays the rotating Discord-bot persona of the day with its name and
 * full intro message visible (no hover tooltip). Intended to live at the
 * top of the groups list — a welcoming "your friend just said hi" moment
 * on daily return to the app.
 */
export function PersonaBadge() {
  const { t } = useTranslation()
  const [persona, setPersona] = useState<PersonaData | null>(null)

  useEffect(() => {
    api.getCurrentPersona()
      .then(setPersona)
      .catch(() => {})
  }, [])

  if (!persona) return null

  const color = colorIntToHex(persona.embedColor)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label={t('persona.today')}
      className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-card/40 p-4 mb-6"
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
              {t('persona.today')}
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
