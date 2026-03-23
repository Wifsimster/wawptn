import * as React from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

const DESKTOP_BREAKPOINT = '(min-width: 640px)'

interface ResponsiveDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  /** Vaul snap points for mobile drawer (e.g., [0.5, 1]) */
  snapPoints?: (number | string)[]
}

function ResponsiveDialog({ open, onOpenChange, children, snapPoints }: ResponsiveDialogProps) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {children}
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={snapPoints}>
      {children}
    </Drawer>
  )
}

function ResponsiveDialogTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop ? <DialogTrigger ref={ref} {...props} /> : <DrawerTrigger ref={ref} {...props} />
}

function ResponsiveDialogClose({
  ref,
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop ? <DialogClose ref={ref} {...props} /> : <DrawerClose ref={ref} {...props} />
}

function ResponsiveDialogContent({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)

  if (isDesktop) {
    return (
      <DialogContent ref={ref} className={className} {...props}>
        {children}
      </DialogContent>
    )
  }

  return (
    <DrawerContent ref={ref} className={cn('px-4', className)} {...props}>
      <div className="relative">
        <div className="overflow-y-auto overflow-x-hidden max-h-[calc(96dvh-4rem)] px-0.5 py-2 min-w-0">
          {children}
        </div>
        {/* Scroll fade indicator */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />
      </div>
    </DrawerContent>
  )
}

function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop
    ? <DialogHeader className={className} {...props} />
    : <DrawerHeader className={cn('text-left px-0', className)} {...props} />
}

function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop
    ? <DialogFooter className={className} {...props} />
    : <DrawerFooter className={cn('px-0', className)} {...props} />
}

function ResponsiveDialogTitle({
  ref,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop ? <DialogTitle ref={ref} {...props} /> : <DrawerTitle ref={ref} {...props} />
}

function ResponsiveDialogDescription({
  ref,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop
    ? <DialogDescription ref={ref} {...props} />
    : <DrawerDescription ref={ref} {...props} />
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
