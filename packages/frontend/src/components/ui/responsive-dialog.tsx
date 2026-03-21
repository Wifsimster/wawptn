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

const ResponsiveDialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof DialogTrigger>
>((props, ref) => {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop ? <DialogTrigger ref={ref} {...props} /> : <DrawerTrigger ref={ref} {...props} />
})
ResponsiveDialogTrigger.displayName = 'ResponsiveDialogTrigger'

const ResponsiveDialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof DialogClose>
>((props, ref) => {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop ? <DialogClose ref={ref} {...props} /> : <DrawerClose ref={ref} {...props} />
})
ResponsiveDialogClose.displayName = 'ResponsiveDialogClose'

const ResponsiveDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, children, ...props }, ref) => {
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
})
ResponsiveDialogContent.displayName = 'ResponsiveDialogContent'

function ResponsiveDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop
    ? <DialogHeader className={className} {...props} />
    : <DrawerHeader className={cn('text-left px-0', className)} {...props} />
}

function ResponsiveDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop
    ? <DialogFooter className={className} {...props} />
    : <DrawerFooter className={cn('px-0', className)} {...props} />
}

const ResponsiveDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogTitle>
>((props, ref) => {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop ? <DialogTitle ref={ref} {...props} /> : <DrawerTitle ref={ref} {...props} />
})
ResponsiveDialogTitle.displayName = 'ResponsiveDialogTitle'

const ResponsiveDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogDescription>
>((props, ref) => {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  return isDesktop
    ? <DialogDescription ref={ref} {...props} />
    : <DrawerDescription ref={ref} {...props} />
})
ResponsiveDialogDescription.displayName = 'ResponsiveDialogDescription'

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
