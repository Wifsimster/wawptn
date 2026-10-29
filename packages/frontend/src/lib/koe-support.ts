export function openKoeSupport() {
  const launcher = document.querySelector<HTMLButtonElement>('.koe-root > button[aria-expanded]')
  launcher?.click()
}
