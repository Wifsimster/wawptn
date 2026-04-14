import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Decode HTML entities (e.g. `&quot;`, `&amp;`, `&#39;`) in a string.
 * Steam Store API returns descriptions with HTML-encoded characters which
 * React renders literally — decode them before display.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return str
  const textarea = document.createElement("textarea")
  textarea.innerHTML = str
  return textarea.value
}
