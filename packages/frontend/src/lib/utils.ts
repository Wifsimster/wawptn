import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function decodeHtmlEntities(str: string): string {
  if (!str) return str
  const textarea = document.createElement("textarea")
  textarea.innerHTML = str
  return textarea.value
}
