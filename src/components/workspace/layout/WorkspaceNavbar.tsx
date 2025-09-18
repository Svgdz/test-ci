'use client'

import { useRouter } from 'next/navigation'
import { AccountDropdown } from '@/components/account/AccountDropdown'

interface WorkspaceNavbarProps {
  projectName?: string
  userEmail?: string
  userName?: string
  userAvatar?: string
}

export function WorkspaceNavbar({
  projectName,
  userEmail,
  userName,
  userAvatar,
}: WorkspaceNavbarProps) {
  const router = useRouter()

  // Navigation handler for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBackToDashboard = () => {
    router.push('/dashboard')
  }

  return (
    <nav className='border-b border-gray-200 bg-white'>
      <div className='max-w-full mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex justify-between h-16'>
          <div className='flex items-center space-x-4'>
            <div className='flex-shrink-0'>
              <h1 className='text-xl font-bold text-gray-900'>AIBEXX</h1>
            </div>
            {projectName && (
              <>
                <div className='text-gray-400'>/</div>
                <div className='text-lg font-medium text-gray-700'>{projectName}</div>
              </>
            )}
          </div>

          <div className='flex items-center space-x-4'>
            <AccountDropdown userEmail={userEmail} userName={userName} userAvatar={userAvatar} />
          </div>
        </div>
      </div>
    </nav>
  )
}
