import { Users, Vote, Sparkles, Check, Crown, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { WawptnLogo } from '@/components/icons/wawptn-logo'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
}

export function LandingPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <motion.div
          className="text-center max-w-3xl mx-auto"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 mb-6">
            <WawptnLogo size={64} variant="color" />
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">WAWPTN</h1>
          </motion.div>
          <motion.p variants={fadeUp} className="text-2xl sm:text-3xl text-muted-foreground mb-4">
            {t('landing.headline')}
          </motion.p>
          <motion.p variants={fadeUp} className="text-lg text-muted-foreground/80 mb-10 max-w-xl mx-auto">
            {t('landing.subheadline')}
          </motion.p>
          <motion.div variants={fadeUp}>
            <Button variant="steam" size="lg" asChild>
              <a href="/api/auth/steam/login" className="gap-3 text-lg px-8 py-6">
                <svg className="w-7 h-7" viewBox="0 0 256 259" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M127.779 0C60.21 0 5.2 52.063.553 117.735l68.39 28.273c5.801-3.964 12.8-6.288 20.358-6.288.672 0 1.34.023 2.004.06l30.469-44.148v-.62c0-26.392 21.476-47.868 47.868-47.868 26.393 0 47.869 21.476 47.869 47.869 0 26.392-21.476 47.868-47.869 47.868h-1.108l-43.44 31.026c0 .524.032 1.049.032 1.578 0 19.803-16.096 35.898-35.898 35.898-17.463 0-32.058-12.535-35.263-29.116L3.27 155.962C20.038 213.357 69.68 258.557 127.779 258.557c71.472 0 129.377-57.905 129.377-129.278C257.156 57.905 199.251 0 127.779 0" /></svg>
                {t('landing.cta')}
              </a>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            className="text-3xl font-bold text-center mb-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            {t('landing.featuresTitle')}
          </motion.h2>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <Users className="w-10 h-10 text-primary mb-2" />
                  <CardTitle>{t('landing.feature1Title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t('landing.feature1Desc')}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <Vote className="w-10 h-10 text-primary mb-2" />
                  <CardTitle>{t('landing.feature2Title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t('landing.feature2Desc')}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <Sparkles className="w-10 h-10 text-primary mb-2" />
                  <CardTitle>{t('landing.feature3Title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t('landing.feature3Desc')}</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 py-20" id="pricing">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="text-3xl font-bold text-center mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            {t('landing.pricingTitle')}
          </motion.h2>
          <motion.p
            className="text-muted-foreground text-center mb-12 max-w-lg mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            {t('landing.pricingSubtitle')}
          </motion.p>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {/* Free Tier */}
            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-6 h-6 text-muted-foreground" />
                    <CardTitle className="text-xl">{t('landing.freeTierName')}</CardTitle>
                  </div>
                  <p className="text-3xl font-bold">{t('landing.freeTierPrice')}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {(['freeFeature1', 'freeFeature2', 'freeFeature3', 'freeFeature4'] as const).map((key) => (
                      <li key={key} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        <span className="text-sm">{t(`landing.${key}`)}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant="secondary" size="lg" className="w-full mt-6" asChild>
                    <a href="/api/auth/steam/login">{t('landing.freeCtaButton')}</a>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Premium Tier */}
            <motion.div variants={fadeUp}>
              <Card className="h-full border-reward/50 bg-gradient-to-br from-reward/[0.06] to-transparent relative">
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-reward text-reward-foreground hover:bg-reward/90">
                  {t('landing.premiumBadge')}
                </Badge>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="w-6 h-6 text-reward" />
                    <CardTitle className="text-xl">{t('landing.premiumTierName')}</CardTitle>
                  </div>
                  <p className="text-3xl font-bold">
                    {t('landing.premiumTierPrice')}
                    <span className="text-base font-normal text-muted-foreground">{t('landing.premiumTierPeriod')}</span>
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {(['premiumFeature1', 'premiumFeature2', 'premiumFeature3', 'premiumFeature4', 'premiumFeature5'] as const).map((key) => (
                      <li key={key} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-reward mt-0.5 shrink-0" />
                        <span className="text-sm">{t(`landing.${key}`)}</span>
                      </li>
                    ))}
                  </ul>
                  <Button size="lg" className="w-full mt-6" asChild>
                    <a href="/api/auth/steam/login">{t('landing.premiumCtaButton')}</a>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <WawptnLogo size={20} className="text-muted-foreground" />
          <span className="font-semibold">WAWPTN</span>
        </div>
        <p>{t('app.tagline')} — v{__APP_VERSION__}</p>
        <p className="mt-1 text-xs text-muted-foreground/50">
          {t('login.privacy')}
        </p>
      </footer>
    </div>
  )
}
