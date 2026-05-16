import { Link } from 'react-router-dom'
import { WawptnLogo } from '@/components/icons/wawptn-logo'
import { useTranslation } from 'react-i18next'

// The legal documents (mentions légales, CGU, CGV, confidentialité,
// cookies, remboursement) are published once on the operator's portfolio
// site and explicitly cover wawptn.battistella.ovh — link to the canonical
// copies rather than maintaining a divergent set here.
const LEGAL_BASE = 'https://pro.battistella.ovh'

export function AppFooter() {
  const { t } = useTranslation()

  const legalLinks = [
    { href: `${LEGAL_BASE}/mentions-legales`, label: t('footer.legalNotice') },
    { href: `${LEGAL_BASE}/cgu`, label: t('footer.terms') },
    { href: `${LEGAL_BASE}/cgv`, label: t('footer.salesTerms') },
    { href: `${LEGAL_BASE}/confidentialite`, label: t('footer.privacy') },
    { href: `${LEGAL_BASE}/cookies`, label: t('footer.cookies') },
    { href: `${LEGAL_BASE}/remboursement`, label: t('footer.refund') },
  ]

  return (
    <footer className="border-t border-border px-4 py-6 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-2 text-xs text-muted-foreground text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <WawptnLogo size={16} className="text-muted-foreground shrink-0" />
          <span className="break-words min-w-0">
            WAWPTN — {t('app.tagline')} — v{__APP_VERSION__} — {new Date(__BUILD_TIME__).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
          aria-label={t('footer.legalNav')}
        >
          <Link
            to="/contact"
            className="underline-offset-2 hover:text-foreground hover:underline transition-colors"
          >
            {t('contact.title')}
          </Link>
          {legalLinks.map((link) => (
            <span key={link.href} className="flex items-center gap-x-2">
              <span aria-hidden="true">·</span>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline transition-colors"
              >
                {link.label}
              </a>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  )
}
