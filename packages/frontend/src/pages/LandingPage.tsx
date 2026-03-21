import {
  Gamepad2,
  Users,
  Vote,
  Sparkles,
  Check,
  Crown,
  Zap,
  Dices,
  Swords,
  Trophy,
  ChevronRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WawptnLogo } from '@/components/icons/wawptn-logo'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

function FloatingIcon({
  icon: Icon,
  className,
  delay = 0,
  duration = 6,
}: {
  icon: typeof Gamepad2
  className: string
  delay?: number
  duration?: number
}) {
  return (
    <motion.div
      className={`absolute pointer-events-none select-none ${className}`}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        y: [0, -12, 0],
        rotate: [0, 5, -5, 0],
      }}
      transition={{
        opacity: { duration: 1, delay },
        y: { duration, repeat: Infinity, delay, ease: 'easeInOut' },
        rotate: {
          duration: duration * 1.3,
          repeat: Infinity,
          delay,
          ease: 'easeInOut',
        },
      }}
    >
      <Icon className="w-full h-full" />
    </motion.div>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="relative">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span className="font-heading text-lg sm:text-xl font-bold text-primary">
          {String(n).padStart(2, '0')}
        </span>
      </div>
      <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl -z-10" />
    </div>
  )
}

export function LandingPage() {
  const { t } = useTranslation()

  const steps = [
    {
      icon: Users,
      titleKey: 'landing.feature1Title' as const,
      descKey: 'landing.feature1Desc' as const,
    },
    {
      icon: Vote,
      titleKey: 'landing.feature2Title' as const,
      descKey: 'landing.feature2Desc' as const,
    },
    {
      icon: Sparkles,
      titleKey: 'landing.feature3Title' as const,
      descKey: 'landing.feature3Desc' as const,
    },
  ]

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 py-24">
        {/* Dot grid texture */}
        <div className="absolute inset-0 landing-dot-grid pointer-events-none" />

        {/* Glow orbs */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] sm:w-[700px] h-[400px] sm:h-[500px] rounded-full bg-primary/15 blur-[120px] sm:blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] rounded-full bg-reward/[0.06] blur-[80px] sm:blur-[100px] pointer-events-none" />

        {/* Floating decorative icons */}
        <FloatingIcon
          icon={Dices}
          className="top-[12%] left-[6%] sm:left-[12%] w-8 h-8 sm:w-11 sm:h-11 text-primary/20"
          delay={0}
          duration={7}
        />
        <FloatingIcon
          icon={Swords}
          className="top-[18%] right-[8%] sm:right-[14%] w-9 h-9 sm:w-12 sm:h-12 text-primary/15 hidden sm:block"
          delay={1.2}
          duration={8}
        />
        <FloatingIcon
          icon={Gamepad2}
          className="bottom-[22%] left-[8%] sm:left-[15%] w-10 h-10 sm:w-14 sm:h-14 text-primary/12"
          delay={0.6}
          duration={6.5}
        />
        <FloatingIcon
          icon={Trophy}
          className="bottom-[18%] right-[6%] sm:right-[12%] w-8 h-8 sm:w-10 sm:h-10 text-reward/[0.18]"
          delay={1.8}
          duration={7.5}
        />
        <FloatingIcon
          icon={Sparkles}
          className="top-[35%] right-[5%] sm:right-[8%] w-6 h-6 sm:w-8 sm:h-8 text-primary/10 hidden sm:block"
          delay={2.5}
          duration={9}
        />

        {/* Content */}
        <motion.div
          className="text-center max-w-4xl mx-auto relative z-10"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          {/* Tag pill */}
          <motion.div variants={fadeUp} className="mb-8">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-border/40 bg-card/40 backdrop-blur-md">
              <WawptnLogo size={18} variant="color" />
              <span className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground/80">
                WAWPTN
              </span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="font-heading text-[clamp(2.5rem,8vw,6.5rem)] font-extrabold tracking-[-0.03em] leading-[0.9] mb-6"
          >
            <span className="block">{t('landing.headlineLine1')}</span>
            <span className="block landing-gradient-text">
              {t('landing.headlineLine2')}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeUp}
            className="text-base sm:text-lg lg:text-xl text-muted-foreground/60 mb-10 max-w-xl mx-auto leading-relaxed"
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
            <p className="text-xs text-muted-foreground/40">
              {t('landing.ctaSubtext')}
            </p>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <motion.div
            className="w-6 h-10 rounded-full border-2 border-muted-foreground/20 flex items-start justify-center p-1.5"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
              animate={{ y: [0, 16, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="relative px-4 py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto relative">
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

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            {steps.map((step, i) => (
              <motion.div key={i} variants={fadeUp} className="group">
                <div className="relative h-full p-6 sm:p-8 rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm transition-all duration-500 hover:border-primary/30 hover:bg-card/50">
                  <StepNumber n={i + 1} />

                  <div className="mt-6 mb-4">
                    <step.icon className="w-7 h-7 sm:w-8 sm:h-8 text-primary/80" />
                  </div>

                  <h3 className="font-heading text-lg sm:text-xl font-semibold mb-3 tracking-tight">
                    {t(step.titleKey)}
                  </h3>
                  <p className="text-sm text-muted-foreground/70 leading-relaxed">
                    {t(step.descKey)}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
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
            <p className="text-muted-foreground/60 max-w-md mx-auto">
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
            <motion.div variants={fadeUp}>
              <div className="h-full rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
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
                      <Check className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground/80">
                        {t(`landing.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button variant="secondary" size="lg" className="w-full" asChild>
                  <a href="/api/auth/steam/login">
                    {t('landing.freeCtaButton')}
                  </a>
                </Button>
              </div>
            </motion.div>

            {/* Premium Tier */}
            <motion.div variants={fadeUp}>
              <div className="h-full rounded-2xl landing-premium-card p-6 sm:p-8 relative">
                <Badge className="absolute -top-3 left-6 bg-reward text-reward-foreground hover:bg-reward/90">
                  {t('landing.premiumBadge')}
                </Badge>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-reward/10 flex items-center justify-center">
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
      <footer className="border-t border-border/20 px-4 py-8 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground/40">
          <div className="flex items-center gap-2">
            <WawptnLogo size={20} className="text-muted-foreground" />
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
