import { useEffect } from 'react'

const BASE_TITLE = 'WAWPTN'

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} — ${BASE_TITLE}`
    return () => {
      document.title = previous
    }
  }, [title])
}
