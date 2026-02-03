'use client'

import React, { forwardRef, useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AsyncButtonProps extends ButtonProps {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => Promise<void> | void
  loadingText?: string
  isLoading?: boolean // Controlled loading state
}

export const AsyncButton = forwardRef<HTMLButtonElement, AsyncButtonProps>(
  ({ onClick, children, loadingText, disabled, isLoading: controlledLoading, className, ...props }, ref) => {
    const [internalLoading, setInternalLoading] = useState(false)
    
    // Use controlled loading if provided, otherwise use internal state
    const isLoading = controlledLoading !== undefined ? controlledLoading : internalLoading

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!onClick || isLoading) return
      
      // Only manage internal state if not controlled
      if (controlledLoading === undefined) {
        try {
          setInternalLoading(true)
          await onClick(e)
        } catch (error) {
          console.error('[v0] AsyncButton error:', error)
        } finally {
          setInternalLoading(false)
        }
      } else {
        // For controlled mode, just call onClick
        await onClick(e)
      }
    }

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={cn(
          'transition-all',
          isLoading && 'opacity-80',
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isLoading && loadingText ? loadingText : children}
      </Button>
    )
  }
)

AsyncButton.displayName = 'AsyncButton'
