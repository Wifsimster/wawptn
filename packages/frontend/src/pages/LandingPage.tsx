import {
  Users,
  Vote,
  Sparkles,
  Check,
  Crown,
  Zap,
  ChevronRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WawptnLogo } from '@/components/icons/wawptn-logo'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

const STEPS = [
  { icon: Users, titleKey: 'landing.feature1Title', descKey: 'landing.feature1Desc', accent: 'neon' },
  { icon: Vote, titleKey: 'landing.feature2Title', descKey: 'landing.feature2Desc', accent: 'primary' },
  { icon: Sparkles, titleKey: 'landing.feature3Title', descKey: 'landing.feature3Desc', accent: 'reward' },
] as const

const ACCENT_STYLES = {
  neon: { icon: 'text-neon', badge: 'bg-neon/10 border-neon/20 text-neon', glow: 'bg-neon/5' },
  primary: { icon: 'text-primary', badge: 'bg-primary/10 border-primary/20 text-primary', glow: 'bg-primary/5' },
  reward: { icon: 'text-reward', badge: 'bg-reward/10 border-reward/20 text-reward', glow: 'bg-reward/5' },
} as const

export function LandingPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 py-24">
        {/* Top edge accent */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

        {/* Giant "?" watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <motion.span
            className="landing-question-mark font-heading font-extrabold text-[45vw] sm:text-[35vw] lg:text-[28vw] leading-none"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: [1, 1.03, 1],
              rotate: [0, -1.5, 0, 1.5, 0],
            }}
            transition={{
              opacity: { duration: 2, ease: 'easeOut' },
              scale: { duration: 10, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 14, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            ?
          </motion.span>
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] sm:w-[700px] h-[500px] sm:h-[600px] rounded-full bg-primary/20 blur-[150px] sm:blur-[200px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-1/4 w-[300px] sm:w-[400px] h-[250px] sm:h-[350px] rounded-full bg-neon/[0.06] blur-[100px] sm:blur-[130px] pointer-events-none" />
        <div className="absolute top-1/2 left-[10%] w-[200px] h-[200px] rounded-full bg-reward/[0.04] blur-[80px] pointer-events-none hidden lg:block" />

        {/* Content */}
        <motion.div
          className="text-center max-w-5xl mx-auto relative z-10"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          {/* Brand pill */}
          <motion.div variants={fadeUp} className="mb-10 sm:mb-12">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
              <WawptnLogo size={18} variant="color" />
              <span className="text-[11px] font-semibold tracking-[0.3em] uppercase text-white/35">
                WAWPTN
              </span>
            </div>
          </motion.div>

          {/* Asymmetric headline: small lead-in + massive punchline */}
          <motion.h1
            variants={fadeUp}
            className="font-heading font-extrabold tracking-[-0.04em]"
          >
            <span className="block text-[clamp(1.4rem,4.5vw,3rem)] text-foreground/50 leading-tight mb-2 sm:mb-3">
              {t('landing.headlineLine1')}
            </span>
            <span className="block text-[clamp(3.5rem,14vw,11rem)] leading-[0.85] landing-gradient-text">
              {t('landing.headlineLine2')}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeUp}
            className="text-base sm:text-lg text-muted-foreground/50 mt-8 sm:mt-10 mb-10 sm:mb-12 max-w-lg mx-auto leading-relaxed"
          >
            {t('landing.subheadline')}
          </motion.p>

          {/* CTA */}
          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center gap-4"
          >
            <Button variant="steam" size="lg" asChild>
              <a
                href="/api/auth/steam/login"
                className="gap-3 text-base sm:text-lg px-8 py-6 group"
              >
                <svg
                  className="w-6 h-6 transition-transform group-hover:scale-110"
                  viewBox="0 0 256 259"
                  fill="currentColor"
                >
                  <path d="M127.779 0C60.21 0 5.2 52.063.553 117.735l68.39 28.273c5.801-3.964 12.8-6.288 20.358-6.288.672 0 1.34.023 2.004.06l30.469-44.148v-.62c0-26.392 21.476-47.868 47.868-47.868 26.393 0 47.869 21.476 47.869 47.869 0 26.392-21.476 47.868-47.869 47.868h-1.108l-43.44 31.026c0 .524.032 1.049.032 1.578 0 19.803-16.096 35.898-35.898 35.898-17.463 0-32.058-12.535-35.263-29.116L3.27 155.962C20.038 213.357 69.68 258.557 127.779 258.557c71.472 0 129.377-57.905 129.377-129.278C257.156 57.905 199.251 0 127.779 0" />
                </svg>
                {t('landing.cta')}
                <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <p className="text-xs text-muted-foreground/30">
              {t('landing.ctaSubtext')}
            </p>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
        >
          <motion.div
            className="w-6 h-10 rounded-full border border-white/10 flex items-start justify-center p-1.5"
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <motion.div
              className="w-1 h-1 rounded-full bg-white/30"
              animate={{ y: [0, 16, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="relative px-4 py-24 sm:py-32">
        {/* Section divider */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-16 sm:mb-20"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              {t('landing.featuresTitle')}
            </h2>
          </motion.div>

          <div className="relative">
            {/* Connecting line between step badges (desktop) */}
            <div className="hidden md:block absolute top-7 left-[15%] right-[15%] h-px bg-gradient-to-r from-neon/25 via-primary/30 to-reward/20" />

            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={stagger}
            >
              {STEPS.map((step, i) => {
                const colors = ACCENT_STYLES[step.accent]
                return (
                  <motion.div key={i} variants={scaleIn}>
                    <div className="relative h-full">
                      {/* Step number badge */}
                      <div className="flex justify-center mb-6">
                        <div className="relative">
                          <div
                            className={`w-14 h-14 rounded-2xl border flex items-center justify-center bg-card/60 backdrop-blur-sm ${colors.badge}`}
                          >
                            <span className="font-heading text-xl font-bold">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          </div>
                          <div
                            className={`absolute inset-0 rounded-2xl ${colors.glow} blur-xl -z-10`}
                          />
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="landing-glass-card p-6 sm:p-8 rounded-2xl text-center transition-all duration-500 hover:bg-white/[0.04] hover:border-white/[0.1]">
                        <step.icon
                          className={`w-8 h-8 mx-auto mb-5 ${colors.icon}`}
                        />
                        <h3 className="font-heading text-lg sm:text-xl font-semibold mb-3 tracking-tight">
                          {t(step.titleKey)}
                        </h3>
                        <p className="text-sm text-muted-foreground/60 leading-relaxed">
                          {t(step.descKey)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="px-4 py-24 sm:py-32" id="pricing">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              {t('landing.pricingTitle')}
            </h2>
            <p className="text-muted-foreground/50 max-w-md mx-auto">
              {t('landing.pricingSubtitle')}
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            {/* Free Tier */}
            <motion.div variants={scaleIn}>
              <div className="h-full landing-glass-card rounded-2xl p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <Zap className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-semibold">
                      {t('landing.freeTierName')}
                    </h3>
                    <p className="text-2xl font-bold">
                      {t('landing.freeTierPrice')}
                    </p>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {(
                    [
                      'freeFeature1',
                      'freeFeature2',
                      'freeFeature3',
                      'freeFeature4',
                    ] as const
                  ).map((key) => (
                    <li key={key} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground/65">
                        {t(`landing.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  asChild
                >
                  <a href="/api/auth/steam/login">
                    {t('landing.freeCtaButton')}
                  </a>
                </Button>
              </div>
            </motion.div>

            {/* Premium Tier */}
            <motion.div variants={scaleIn}>
              <div className="h-full rounded-2xl landing-premium-card p-6 sm:p-8 relative">
                <Badge className="absolute -top-3 left-6 bg-reward text-reward-foreground hover:bg-reward/90">
                  {t('landing.premiumBadge')}
                </Badge>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-reward/10 border border-reward/20 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-reward" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-semibold">
                      {t('landing.premiumTierName')}
                    </h3>
                    <p className="text-2xl font-bold">
                      {t('landing.premiumTierPrice')}
                      <span className="text-sm font-normal text-muted-foreground">
                        {t('landing.premiumTierPeriod')}
                      </span>
                    </p>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {(
                    [
                      'premiumFeature1',
                      'premiumFeature2',
                      'premiumFeature3',
                      'premiumFeature4',
                      'premiumFeature5',
                    ] as const
                  ).map((key) => (
                    <li key={key} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-reward mt-0.5 shrink-0" />
                      <span className="text-sm">{t(`landing.${key}`)}</span>
                    </li>
                  ))}
                </ul>

                <Button size="lg" className="w-full" asChild>
                  <a href="/api/auth/steam/login">
                    {t('landing.premiumCtaButton')}
                  </a>
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/[0.04] px-4 py-8 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground/30">
          <div className="flex items-center gap-2">
            <WawptnLogo size={20} className="text-muted-foreground/30" />
            <span>
              WAWPTN — {t('app.tagline')} — v{__APP_VERSION__}
            </span>
          </div>
          <p className="text-xs">{t('login.privacy')}</p>
        </div>
      </footer>
    </div>
  )
}
