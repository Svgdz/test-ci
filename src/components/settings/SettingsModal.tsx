'use client'

import { useState, useRef, useEffect } from 'react'
import { X, User, BarChart3, Gift, Palette, Key, Database, Camera } from 'lucide-react'
import { Button } from '@/ui/primitives/button'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail?: string
  userName?: string
  userAvatar?: string
}

type SettingsTab = 'account' | 'usage' | 'referrals' | 'appearance' | 'tokens' | 'data'

export function SettingsModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  userAvatar,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const [name, setName] = useState(userName || '')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [website, setWebsite] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

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

  const sidebarItems = [
    { id: 'account' as const, label: 'Account', icon: User },
    { id: 'usage' as const, label: 'Usage', icon: BarChart3 },
    { id: 'referrals' as const, label: 'Referrals', icon: Gift },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'tokens' as const, label: 'Access Tokens', icon: Key },
    { id: 'data' as const, label: 'Data', icon: Database },
  ]

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200'>
      <div
        ref={modalRef}
        className='bg-white text-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[600px] flex overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300'
      >
        {/* Sidebar */}
        <div className='w-64 bg-gray-50 border-r border-gray-200 p-6'>
          <div className='flex items-center justify-between mb-8'>
            <h2 className='text-xl font-semibold text-gray-900'>Settings</h2>
            <button
              onClick={onClose}
              className='text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100'
            >
              <X className='h-5 w-5' />
            </button>
          </div>

          <nav className='space-y-2'>
            {sidebarItems.map((item) => {
              const IconComponent = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-all duration-200 ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <IconComponent className='h-4 w-4' />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className='flex-1 p-8 overflow-y-auto'>
          {activeTab === 'account' && (
            <div className='animate-in fade-in slide-in-from-right-4 duration-300'>
              <h3 className='text-2xl font-semibold mb-8 text-gray-900'>Account</h3>

              {/* Profile Section */}
              <div className='mb-8'>
                <div className='flex items-center space-x-4 mb-6'>
                  <div className='w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-medium overflow-hidden'>
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
                  <div>
                    <h4 className='text-lg font-medium text-gray-900'>
                      {userName || userEmail?.split('@')[0] || 'User'}
                    </h4>
                    <p className='text-gray-500'>{userEmail}</p>
                  </div>
                </div>

                <button className='flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors hover:bg-gray-50 px-3 py-2 rounded-md'>
                  <Camera className='h-4 w-4' />
                  <span>Change profile picture</span>
                </button>
              </div>

              {/* Form Fields */}
              <div className='space-y-6'>
                <div>
                  <label className='block text-sm font-medium mb-2 text-gray-700'>Username</label>
                  <input
                    type='text'
                    value='J2Yu4cwo5XxF6vq1'
                    readOnly
                    className='w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-gray-600 cursor-not-allowed'
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium mb-2 text-gray-700'>Name</label>
                  <input
                    type='text'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className='w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    placeholder='Enter your name'
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium mb-2 text-gray-700'>Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className='w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors'
                    rows={3}
                    placeholder='Tell us about yourself'
                    maxLength={160}
                  />
                  <div className='text-right text-sm text-gray-500 mt-1'>{bio.length}/160</div>
                </div>

                <div>
                  <label className='block text-sm font-medium mb-2 text-gray-700'>Location</label>
                  <input
                    type='text'
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className='w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    placeholder='Location'
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium mb-2 text-gray-700'>Website</label>
                  <input
                    type='url'
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className='w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    placeholder='https://example.com'
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className='mt-8 flex justify-end'>
                <Button className='bg-blue-600 hover:bg-blue-700 transition-colors'>
                  Save Changes
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'usage' && (
            <div className='animate-in fade-in slide-in-from-right-4 duration-300'>
              <h3 className='text-2xl font-semibold mb-8 text-gray-900'>Usage</h3>
              <p className='text-gray-600'>Usage statistics will be displayed here.</p>
            </div>
          )}

          {activeTab === 'referrals' && (
            <div className='animate-in fade-in slide-in-from-right-4 duration-300'>
              <h3 className='text-2xl font-semibold mb-8 text-gray-900'>Referrals</h3>
              <p className='text-gray-600'>Referral program details will be displayed here.</p>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className='animate-in fade-in slide-in-from-right-4 duration-300'>
              <h3 className='text-2xl font-semibold mb-8 text-gray-900'>Appearance</h3>
              <p className='text-gray-600'>Theme and appearance settings will be displayed here.</p>
            </div>
          )}

          {activeTab === 'tokens' && (
            <div className='animate-in fade-in slide-in-from-right-4 duration-300'>
              <h3 className='text-2xl font-semibold mb-8 text-gray-900'>Access Tokens</h3>
              <p className='text-gray-600'>API tokens and access keys will be displayed here.</p>
            </div>
          )}

          {activeTab === 'data' && (
            <div className='animate-in fade-in slide-in-from-right-4 duration-300'>
              <h3 className='text-2xl font-semibold mb-8 text-gray-900'>Data</h3>
              <p className='text-gray-600'>
                Data export and privacy settings will be displayed here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
