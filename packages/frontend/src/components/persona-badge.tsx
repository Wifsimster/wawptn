import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

interface PersonaData {
  name: string
  embedColor: number
  introMessage: string
}

function colorIntToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function PersonaBadge() {
  const { t } = useTranslation()
  const [persona, setPersona] = useState<PersonaData | null>(null)

  useEffect(() => {
    api.getCurrentPersona()
      .then(setPersona)
      .catch(() => {})
  }, [])

  if (!persona) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1.5 cursor-default text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: colorIntToHex(persona.embedColor) }}
            />
            <span className="hidden sm:inline truncate max-w-[120px]">
              {persona.name}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p className="font-medium text-xs">{t('persona.today')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{persona.introMessage}</p>
        </TooltipContent>
      </Tooltip>
    </motion.div>
  )
}
