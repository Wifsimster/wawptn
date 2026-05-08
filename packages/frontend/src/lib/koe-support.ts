/**
 * Trigger the Koe support widget from outside the React tree (e.g. a
 * dropdown menu item in the app header). The widget itself ships a
 * floating launcher button that we hide visually via CSS in the
 * `KoeSupport` component — calling this clicks that hidden launcher
 * to open the panel.
 *
 * Pulled into its own file so `components/KoeSupport.tsx` stays a
 * components-only export module (Vite's react-refresh fast-refresh
 * needs that to hot-reload reliably).
 */
export function openKoeSupport() {
  const launcher = document.querySelector<HTMLButtonElement>('.koe-root > button[aria-expanded]')
  launcher?.click()
}
