import { useEffect } from 'react'

const BASE_TITLE = 'WAWPTN'

/**
 * Set `document.title` while the component is mounted, restoring the
 * previous value on unmount. Improves screen-reader context on route
 * changes (WCAG 2.4.2 Page Titled).
 */
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
