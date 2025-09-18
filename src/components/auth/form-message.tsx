'use client'

import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/ui/primitives/alert'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { motion } from 'framer-motion'

export type AuthMessage = { success?: string } | { error?: string } | { message?: string }

export function AuthFormMessage({
  className,
  message,
}: {
  className?: string
  message: AuthMessage
}) {
  return (
    <motion.div
      className={cn('flex w-full max-w-md flex-col gap-2', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
    >
      {'success' in message && (
        <Alert variant='default'>
          <CheckCircle2 className='h-4 w-4' />
          <AlertDescription>{decodeURIComponent(message.success!)}</AlertDescription>
        </Alert>
      )}
      {'error' in message && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>{decodeURIComponent(message.error!)}</AlertDescription>
        </Alert>
      )}
      {'message' in message && (
        <Alert variant='default'>
          <Info className='h-4 w-4' />
          <AlertDescription>{decodeURIComponent(message.message!)}</AlertDescription>
        </Alert>
      )}
    </motion.div>
  )
}
