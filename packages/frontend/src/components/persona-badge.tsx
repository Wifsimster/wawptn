import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { clampPersonaColor } from '@/lib/persona-color'

interface PersonaData {
  id?: string
  name: string
  embedColor: number
  introMessage: string
}

interface PersonaBadgeProps {
  groupId?: string
  persona?: PersonaData | null
  variant?: 'hero' | 'compact'
  className?: string
}

export function PersonaBadge({ groupId, persona: initialPersona, variant = 'hero', className }: PersonaBadgeProps) {
  const { t } = useTranslation()
  const [fetched, setFetched] = useState<PersonaData | null>(null)

  useEffect(() => {
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
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [groupId, initialPersona])

  const persona = initialPersona ?? fetched
  if (!persona) return null

  const color = clampPersonaColor(persona.embedColor)

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
        <Sparkles className="size-3" />
        <span className="truncate max-w-[140px]">{persona.name}</span>
      </span>
    )
  }

  return (
    <m.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label={t('persona.todayGroup')}
      className={`relative overflow-hidden rounded-xl border border-border bg-card/40 shadow-1 p-4 ${className ?? ''}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center size-9 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: `${color}26`, color }}
          aria-hidden="true"
        >
          <Sparkles className="size-4" />
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
    </m.section>
  )
}
