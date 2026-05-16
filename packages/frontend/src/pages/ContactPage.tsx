import { Link } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { WawptnLogo } from '@/components/icons/wawptn-logo'
import { AppFooter } from '@/components/app-footer'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const DISCORD_INVITE_URL = 'https://discord.gg/YjVwENDVSH'
const SUPPORT_EMAIL = 'battistella@proton.me'

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export function ContactPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('contact.title'))

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-border px-4 h-14 flex items-center">
        <div className="max-w-2xl mx-auto w-full flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/" aria-label={t('notFound.backHome')}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label={t('app.name')}
          >
            <WawptnLogo size={28} className="text-primary" aria-hidden="true" />
            <span className="font-heading font-bold text-lg tracking-[-0.03em]">WAWPTN</span>
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-[-0.03em] mb-2">
          {t('contact.title')}
        </h1>
        <p className="text-muted-foreground mb-8">{t('contact.subtitle')}</p>

        <Card>
          <CardContent
            padding="lg"
            className="flex flex-col items-center text-center gap-4 pt-6"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#5865F2]/15">
              <DiscordIcon className="size-7 text-[#5865F2]" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-heading text-lg font-semibold">{t('contact.discordTitle')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('contact.discordDescription')}
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto bg-[#5865F2] text-white hover:bg-[#4752c4]"
            >
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                <DiscordIcon />
                {t('contact.discordCta')}
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent
            padding="lg"
            className="flex flex-col items-center text-center gap-4 pt-6"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15">
              <Mail className="size-7 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-heading text-lg font-semibold">{t('contact.emailTitle')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('contact.emailDescription')}
              </p>
            </div>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail />
                {t('contact.emailCta')}
              </a>
            </Button>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  )
}
