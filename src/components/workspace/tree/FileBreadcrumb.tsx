import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { memo, useEffect, useRef, useState } from 'react'
import { ChevronRight, File } from 'lucide-react'
import type { FileMap } from '@/lib/stores/files'
import { cn } from '@/lib/utils'
import { l } from '@/lib/clients/logger'
import { FileTree } from './FileTree'

// Work directory that we want to strip from breadcrumbs
const WORK_DIR = '/home/user'
const WORK_DIR_REGEX = new RegExp(`^${WORK_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

interface FileBreadcrumbProps {
  files?: FileMap
  selectedFile?: string
  onFileSelect?: (filePath: string) => void
}

const contextMenuVariants = {
  open: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.1, 0.25, 1], // cubic-bezier easing
    },
  },
  close: {
    y: 6,
    opacity: 0,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
} satisfies Variants

export const FileBreadcrumb = memo<FileBreadcrumbProps>(({ files, selectedFile, onFileSelect }) => {
  l.debug('FileBreadcrumb render')

  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([])

  // Extract path segments from selected file, removing the work directory
  const pathSegments = selectedFile
    ? selectedFile.replace(WORK_DIR_REGEX, '').replace(/^\//, '').split('/').filter(Boolean)
    : []

  const handleSegmentClick = (index: number) => {
    setActiveIndex((prevIndex) => (prevIndex === index ? null : index))
  }

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        activeIndex !== null &&
        !contextMenuRef.current?.contains(event.target as Node) &&
        !segmentRefs.current.some((ref) => ref?.contains(event.target as Node))
      ) {
        setActiveIndex(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [activeIndex])

  if (!files || !selectedFile || pathSegments.length === 0) {
    return null
  }

  return (
    <div className='flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'>
      {pathSegments.map((segment, index) => {
        const isLast = index === pathSegments.length - 1

        // Build the path up to this segment (relative to work dir)
        const relativePath = pathSegments.slice(0, index + 1).join('/')
        const fullPath = `${WORK_DIR}/${relativePath}`

        // Build the parent path for the dropdown
        const parentPath =
          index === 0 ? WORK_DIR : `${WORK_DIR}/${pathSegments.slice(0, index).join('/')}`

        const isActive = activeIndex === index

        return (
          <div key={index} className='relative flex items-center'>
            <DropdownMenu.Root open={isActive} modal={false}>
              <DropdownMenu.Trigger asChild>
                <span
                  ref={(ref) => {
                    segmentRefs.current[index] = ref
                  }}
                  className={cn('flex items-center gap-1.5 cursor-pointer shrink-0 text-sm', {
                    'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100':
                      !isActive,
                    'text-gray-900 dark:text-gray-100 underline': isActive,
                    'pr-2': isLast,
                  })}
                  onClick={() => handleSegmentClick(index)}
                >
                  {isLast && <File size={14} className='text-gray-500' />}
                  {segment}
                </span>
              </DropdownMenu.Trigger>

              {!isLast && <ChevronRight size={14} className='mx-1 text-gray-400' />}

              <AnimatePresence>
                {isActive && (
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className='z-50'
                      asChild
                      align='start'
                      side='bottom'
                      avoidCollisions={false}
                    >
                      <motion.div
                        ref={contextMenuRef}
                        initial='close'
                        animate='open'
                        exit='close'
                        variants={contextMenuVariants}
                      >
                        <div className='rounded-lg overflow-hidden'>
                          <div className='max-h-[50vh] min-w-[300px] overflow-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg rounded-lg'>
                            <FileTree
                              files={files}
                              hideRoot
                              rootFolder={parentPath}
                              collapsed={true}
                              allowFolderSelection
                              selectedFile={fullPath}
                              onFileSelect={(filePath) => {
                                setActiveIndex(null)
                                onFileSelect?.(filePath)
                              }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                )}
              </AnimatePresence>
            </DropdownMenu.Root>
          </div>
        )
      })}
    </div>
  )
})

FileBreadcrumb.displayName = 'FileBreadcrumb'
