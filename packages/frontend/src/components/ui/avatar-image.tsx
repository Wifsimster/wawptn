import * as React from 'react'
import { Avatar as AvatarPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function AvatarImage({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      data-slot="avatar-image"
      width={40}
      height={40}
      className={cn('aspect-square h-full w-full', className)}
      {...props}
    />
  )
}

export { AvatarImage }
