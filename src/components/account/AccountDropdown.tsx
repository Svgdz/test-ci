'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/clients/supabase/client'
import { Settings, HelpCircle, ArrowUpRight, LogOut } from 'lucide-react'
import { SettingsModal } from '@/components/settings/SettingsModal'

interface AccountDropdownProps {
  userEmail?: string
  userName?: string
  userAvatar?: string
}

export function AccountDropdown({ userEmail, userName, userAvatar }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSignOut = async () => {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
      router.refresh()
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      setIsLoading(false)
      setIsOpen(false)
    }
  }

  const handleNavigation = (path: string) => {
    router.push(path)
    setIsOpen(false)
  }

  const handleSettingsClick = () => {
    setIsSettingsOpen(true)
    setIsOpen(false)
  }

  // Get initials for avatar fallback
  const getInitials = () => {
    if (userName) {
      return userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    if (userEmail) {
      return userEmail.charAt(0).toUpperCase()
    }
    return 'U'
  }

  const menuItems = [
    { label: 'Settings', action: handleSettingsClick, icon: Settings },
    { label: 'Help', action: () => handleNavigation('/help'), icon: HelpCircle },
    {
      label: 'Upgrade to Pro',
      action: () => handleNavigation('/upgrade'),
      icon: ArrowUpRight,
      highlight: true,
    },
    { type: 'divider' as const },
    { label: 'Sign out', action: handleSignOut, icon: LogOut, loading: isLoading },
  ]

  return (
    <div className='relative' ref={dropdownRef}>
      {/* Profile Button - Only show profile picture */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden hover:ring-2 hover:ring-indigo-500 hover:ring-offset-2 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
      >
        {userAvatar ? (
          <img
            src={userAvatar}
            alt={userName || userEmail || 'User'}
            className='w-full h-full object-cover'
          />
        ) : (
          <span>{getInitials()}</span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className='absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50'>
          {/* User Info Header */}
          <div className='px-4 py-3 border-b border-gray-100'>
            <div className='flex items-center space-x-3'>
              <div className='w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden'>
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName || userEmail || 'User'}
                    className='w-full h-full object-cover'
                  />
                ) : (
                  <span>{getInitials()}</span>
                )}
              </div>
              <div className='flex-1 min-w-0'>
                <div className='text-sm font-medium text-gray-900 truncate'>
                  {userName || userEmail?.split('@')[0] || 'User'}
                </div>
                <div className='text-sm text-gray-500 truncate'>{userEmail}</div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className='py-1'>
            {menuItems.map((item, index) => {
              if (item.type === 'divider') {
                return <div key={index} className='border-t border-gray-100 my-1' />
              }

              const IconComponent = item.icon

              return (
                <button
                  key={index}
                  onClick={() => void item.action()}
                  disabled={item.loading}
                  className={`flex items-center w-full px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    item.highlight
                      ? 'text-gray-900 hover:bg-gray-50 font-medium'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <IconComponent className='mr-3 h-4 w-4' />
                  <span className='flex-1 text-left'>
                    {item.loading ? 'Signing out...' : item.label}
                  </span>
                  {item.highlight && (
                    <div className='ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full'>
                      Pro
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userEmail={userEmail}
        userName={userName}
        userAvatar={userAvatar}
      />
    </div>
  )
}
