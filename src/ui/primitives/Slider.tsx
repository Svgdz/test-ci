'use client'

import React, { memo } from 'react'
import { cn } from '@/lib/utils'

export interface SliderOption<T> {
  value: T
  text: string
}

export interface SliderOptions<T> {
  left: SliderOption<T>
  right: SliderOption<T>
  center?: SliderOption<T>
}

interface SliderProps<T> {
  selected: T
  options: SliderOptions<T>
  setSelected: (value: T) => void
}

export const Slider = memo(<T,>({ selected, options, setSelected }: SliderProps<T>) => {
  const hasCenter = !!options.center
  const allOptions = hasCenter
    ? [options.left, options.center!, options.right]
    : [options.left, options.right]

  const selectedIndex = allOptions.findIndex((option) => option.value === selected)
  const totalOptions = allOptions.length

  // Calculate position for the background slider
  const getBackgroundPosition = () => {
    if (totalOptions === 2) {
      return selectedIndex === 0 ? 'left-1 right-1/2' : 'left-1/2 right-1'
    } else {
      // For 3 options
      if (selectedIndex === 0) return 'left-1 right-2/3'
      if (selectedIndex === 1) return 'left-1/3 right-1/3'
      return 'left-2/3 right-1'
    }
  }

  return (
    <div className='relative flex bg-gray-200 dark:bg-gray-700 rounded-full p-1'>
      {/* Background slider */}
      <div
        className={cn(
          'absolute top-1 bottom-1 bg-white dark:bg-gray-600 rounded-full transition-all duration-200 ease-out shadow-sm',
          getBackgroundPosition()
        )}
      />

      {/* Render all options */}
      {allOptions.map((option, _index) => (
        <button
          key={option.value as string}
          onClick={() => setSelected(option.value)}
          className={cn(
            'relative z-10 px-3 py-1 text-sm font-medium transition-colors duration-200 rounded-full flex-1',
            {
              'text-gray-900 dark:text-gray-100': selected === option.value,
              'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200':
                selected !== option.value,
            }
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  )
}) as <T>(props: SliderProps<T>) => React.JSX.Element

// Add displayName to the component
Object.assign(Slider, { displayName: 'Slider' })
