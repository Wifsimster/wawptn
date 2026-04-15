import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CronPreset {
  /** Cron expression (standard 5-field format). */
  expression: string
  /** i18n key for the humanized label. */
  labelKey: string
}

/**
 * Curated list of common cron presets exposed as autocomplete suggestions.
 * Kept intentionally short so the dropdown stays scannable.
 */
const CRON_PRESETS: CronPreset[] = [
  { expression: '0 18 * * *', labelKey: 'group.autoVotePresetDaily18' },
  { expression: '0 19 * * *', labelKey: 'group.autoVotePresetDaily19' },
  { expression: '0 20 * * *', labelKey: 'group.autoVotePresetDaily20' },
  { expression: '0 21 * * *', labelKey: 'group.autoVotePresetDaily21' },
  { expression: '0 22 * * *', labelKey: 'group.autoVotePresetDaily22' },
  { expression: '0 20 * * 1-5', labelKey: 'group.autoVotePresetWeekdays20' },
  { expression: '0 20 * * 5', labelKey: 'group.autoVotePresetFriday20' },
  { expression: '0 20 * * 6', labelKey: 'group.autoVotePresetSaturday20' },
  { expression: '0 20 * * 0', labelKey: 'group.autoVotePresetSunday20' },
  { expression: '0 20 * * 5,6', labelKey: 'group.autoVotePresetFridaySaturday20' },
  { expression: '0 20 * * 0,6', labelKey: 'group.autoVotePresetWeekend20' },
]

interface CronAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}

/**
 * Input with a humanized autocomplete dropdown for cron schedules.
 *
 * Users can either type a raw cron expression or pick a preset. Presets are
 * filtered by matching the query against both the humanized label and the
 * cron expression itself.
 */
export function CronAutocomplete({ id, value, onChange, placeholder, autoFocus }: CronAutocompleteProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return CRON_PRESETS
    return CRON_PRESETS.filter((preset) => {
      const label = t(preset.labelKey).toLowerCase()
      return label.includes(query) || preset.expression.toLowerCase().includes(query)
    })
  }, [value, t])

  // Keep the highlight within the bounds of the current filtered list.
  const activeIndex = filtered.length === 0 ? -1 : Math.min(highlight, filtered.length - 1)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Keep the highlighted item visible when navigating with the keyboard.
  useEffect(() => {
    if (!open || !listRef.current || activeIndex < 0) return
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const selectPreset = (preset: CronPreset) => {
    onChange(preset.expression)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      if (filtered.length > 0) {
        const base = activeIndex < 0 ? -1 : activeIndex
        setHighlight((base + 1) % filtered.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      if (filtered.length > 0) {
        const base = activeIndex < 0 ? 0 : activeIndex
        setHighlight((base - 1 + filtered.length) % filtered.length)
      }
    } else if (e.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault()
      selectPreset(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const activeLabel = useMemo(() => {
    const match = CRON_PRESETS.find((p) => p.expression === value.trim())
    return match ? t(match.labelKey) : null
  }, [value, t])

  const listboxId = id ? `${id}-listbox` : undefined
  const activeOptionId = id && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open ? activeOptionId : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setHighlight(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          className="flex h-10 w-full rounded-lg border border-input bg-card/50 pl-3 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-primary/30 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('group.autoVotePresetsToggle')}
          onMouseDown={(e) => {
            e.preventDefault()
            setOpen((o) => !o)
          }}
          className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {activeLabel && !open && (
        <p className="text-xs text-primary/80 mt-1">{activeLabel}</p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-input bg-popover shadow-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t('group.autoVotePresetsEmpty')}
            </div>
          ) : (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="max-h-60 overflow-y-auto py-1"
            >
              {filtered.map((preset, index) => {
                const isActive = index === activeIndex
                const isSelected = preset.expression === value.trim()
                return (
                  <li
                    key={preset.expression}
                    id={id ? `${id}-option-${index}` : undefined}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectPreset(preset)
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors',
                      isActive ? 'bg-primary/15 text-foreground' : 'text-foreground/90'
                    )}
                  >
                    <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100 text-primary' : 'opacity-0')} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{t(preset.labelKey)}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{preset.expression}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
