'use client'

import { motion } from 'framer-motion'

export interface CodeApplicationState {
  stage: 'analyzing' | 'installing' | 'applying' | 'complete' | null
  packages?: string[]
  installedPackages?: string[]
  filesGenerated?: string[]
}

interface CodeApplicationProgressProps {
  state: CodeApplicationState
}

export default function CodeApplicationProgress({ state }: CodeApplicationProgressProps) {
  if (!state.stage || state.stage === 'complete') {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className='inline-block bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800'
    >
      <div className='text-sm font-medium mb-2 text-blue-900 dark:text-blue-100'>
        {state.stage === 'analyzing' && (
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
            Analyzing code...
          </div>
        )}

        {state.stage === 'installing' && (
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
            Installing packages...
          </div>
        )}

        {state.stage === 'applying' && (
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
            Applying changes...
          </div>
        )}
      </div>

      {/* Package installation progress */}
      {state.stage === 'installing' && state.packages && (
        <div className='mb-3'>
          <div className='flex flex-wrap gap-2 justify-start'>
            {state.packages.map((pkg, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className={`px-2 py-1 text-xs rounded-full transition-all ${
                  state.installedPackages?.includes(pkg)
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                }`}
              >
                {pkg}
                {state.installedPackages?.includes(pkg) && (
                  <span className='ml-1 text-green-600 dark:text-green-400'>✓</span>
                )}
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {/* Files being generated */}
      {state.stage === 'applying' && state.filesGenerated && (
        <div className='text-xs text-blue-700 dark:text-blue-300'>
          Creating {state.filesGenerated.length} files...
        </div>
      )}

      {/* Stage descriptions */}
      <p className='text-xs text-blue-600 dark:text-blue-400 mt-2'>
        {state.stage === 'analyzing' && 'Parsing generated code and detecting dependencies...'}
        {state.stage === 'installing' &&
          'This may take a moment while npm installs the required packages...'}
        {state.stage === 'applying' && 'Writing files to your sandbox environment...'}
      </p>
    </motion.div>
  )
}
