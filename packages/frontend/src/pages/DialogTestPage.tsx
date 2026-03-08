import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

/**
 * Visual test page for dialog components at various viewports.
 * Navigate to /test-dialogs to use.
 * Only available in development mode.
 */
export function DialogTestPage() {
  const [activeDialog, setActiveDialog] = useState<string | null>(null)

  return (
    <div className="min-h-screen p-6 space-y-4">
      <h1 className="text-2xl font-bold">Dialog Test Page</h1>
      <p className="text-sm text-muted-foreground">
        Resize browser or use DevTools device toolbar (375px, 390px, 430px) to test mobile.
        On mobile: swipe-to-dismiss drawer. On desktop: centered dialog.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setActiveDialog('simple')}>Simple Dialog</Button>
        <Button onClick={() => setActiveDialog('form')}>Form Dialog</Button>
        <Button onClick={() => setActiveDialog('footer')}>Footer Dialog</Button>
        <Button onClick={() => setActiveDialog('long')}>Long Content Dialog</Button>
        <Button onClick={() => setActiveDialog('no-padding')}>No Padding Dialog</Button>
      </div>

      {/* Simple Dialog */}
      <ResponsiveDialog open={activeDialog === 'simple'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Simple Dialog</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>This is a simple dialog with header and description. Drawer on mobile, centered on desktop.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <p className="text-sm">Content goes here. On mobile you can swipe down to dismiss.</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Form Dialog (like Create/Join Group) */}
      <ResponsiveDialog open={activeDialog === 'form'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Form Dialog</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Test input + button layout on mobile.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="mt-4 space-y-2">
            <label htmlFor="test-input" className="text-sm font-medium">Label</label>
            <div className="flex gap-2">
              <Input id="test-input" placeholder="Type something..." />
              <Button>Submit</Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Footer Dialog (like Logout) */}
      <ResponsiveDialog open={activeDialog === 'footer'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Footer Dialog</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Buttons should stack on mobile with gap, be horizontal on desktop.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="secondary" onClick={() => setActiveDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => setActiveDialog(null)}>Confirm</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Long Content Dialog (like Vote Setup) */}
      <ResponsiveDialog open={activeDialog === 'long'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Long Content Dialog</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Content should scroll within the drawer/dialog.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-2 rounded-md hover:bg-accent/50">
                <div className="w-8 h-8 rounded-full bg-muted" />
                <span className="text-sm">Member {i + 1}</span>
              </div>
            ))}
          </div>
          <ResponsiveDialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setActiveDialog(null)}>Back</Button>
            <Button onClick={() => setActiveDialog(null)}>Continue</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* No Padding Dialog (like Random Pick) */}
      <ResponsiveDialog open={activeDialog === 'no-padding'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <ResponsiveDialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <ResponsiveDialogTitle className="sr-only">No Padding Dialog</ResponsiveDialogTitle>
          <div className="w-full aspect-[460/215] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <span className="text-lg font-bold text-muted-foreground">Game Image Area</span>
          </div>
          <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pick #1</p>
              <h2 className="text-xl font-bold">Game Title</h2>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1">Reroll</Button>
              <Button className="flex-1">Launch</Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">Press Space to reroll</p>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  )
}
