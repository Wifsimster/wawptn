import { useNavigate } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <SearchX className="w-12 h-12 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-bold mb-2">{t('notFound.title')}</h1>
      <p className="text-muted-foreground mb-6">{t('notFound.description')}</p>
      <Button onClick={() => navigate('/')}>{t('notFound.backHome')}</Button>
    </div>
  )
}
