import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
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
  visible: { transition: { staggerChildren: 0.1 } },
}

export function LoginPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* "?" watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <motion.span
          className="landing-question-mark font-heading font-extrabold text-[45vw] sm:text-[32vw] leading-none"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: 1,
            scale: [1, 1.04, 1],
          }}
          transition={{
            opacity: { duration: 2.5, ease: 'easeOut' },
            scale: { duration: 12, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          ?
        </motion.span>
      </div>

      <motion.div
        className="text-center mb-14 relative z-10"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-5">
          <WawptnLogo size={52} variant="color" />
          <h1 className="text-4xl sm:text-5xl font-heading font-bold tracking-[-0.04em]">WAWPTN</h1>
        </motion.div>
        <motion.p variants={fadeUp} className="text-xl text-muted-foreground max-w-md">
          {t('app.tagline')}
        </motion.p>
        <motion.p variants={fadeUp} className="text-sm text-muted-foreground/50 mt-2">
          {t('login.subtitle')}
        </motion.p>
      </motion.div>

      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Button variant="steam" size="lg" asChild>
          <a href="/api/auth/steam/login" className="gap-3 px-8 py-6">
            <svg className="w-6 h-6" viewBox="0 0 256 259" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M127.779 0C60.21 0 5.2 52.063.553 117.735l68.39 28.273c5.801-3.964 12.8-6.288 20.358-6.288.672 0 1.34.023 2.004.06l30.469-44.148v-.62c0-26.392 21.476-47.868 47.868-47.868 26.393 0 47.869 21.476 47.869 47.869 0 26.392-21.476 47.868-47.869 47.868h-1.108l-43.44 31.026c0 .524.032 1.049.032 1.578 0 19.803-16.096 35.898-35.898 35.898-17.463 0-32.058-12.535-35.263-29.116L3.27 155.962C20.038 213.357 69.68 258.557 127.779 258.557c71.472 0 129.377-57.905 129.377-129.278C257.156 57.905 199.251 0 127.779 0" /></svg>
            {t('login.signIn')}
          </a>
        </Button>
      </motion.div>

      <motion.p
        className="mt-8 text-xs text-muted-foreground/30 relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        {t('login.privacy')}
      </motion.p>
    </div>
  )
}
