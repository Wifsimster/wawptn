import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './locales/fr.json'

// French-only for v1. The product UI language is French (CLAUDE.md); the
// English catalogue was incomplete and a half-translated UI is worse than
// a consistent one. Re-introduce LanguageDetector + a complete en.json
// catalogue when English is a real, maintained locale.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
    },
    lng: 'fr',
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
