'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/ui/primitives/button'
import { AUTH_URLS } from '@/configs/urls'
import { AccountDropdown } from '@/components/account/AccountDropdown'

interface NavbarProps {
  isAuthenticated: boolean
  userEmail?: string
  userName?: string
  userAvatar?: string
}

export function Navbar({ isAuthenticated, userEmail, userName, userAvatar }: NavbarProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleSignIn = () => {
    router.push(AUTH_URLS.SIGN_IN)
  }

  const handleSignUp = () => {
    router.push('/sign-up')
  }

  const navigationTabs = [
    { name: 'Home', href: '/', current: pathname === '/' },
    { name: 'Pricing', href: '/Pricing', current: pathname === '/Pricing' },
    { name: 'Features', href: '/features', current: pathname === '/features' },
    { name: 'About', href: '/about', current: pathname === '/about' },
  ]

  const handleNavigation = (href: string) => {
    router.push(href)
  }

  return (
    <nav className='border-b border-gray-200 bg-white'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex justify-between h-16'>
          <div className='flex items-center space-x-8'>
            <div className='flex-shrink-0'>
              <h1
                className='text-xl font-bold text-gray-900 cursor-pointer hover:text-gray-700 transition-colors'
                onClick={() => handleNavigation('/')}
              >
                AIBEXX
              </h1>
            </div>

            {/* Navigation Tabs */}
            <div className='hidden md:flex space-x-8'>
              {navigationTabs.map((tab) => (
                <button
                  key={tab.name}
                  onClick={() => handleNavigation(tab.href)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    tab.current
                      ? 'text-indigo-600 border-b-2 border-indigo-600'
                      : 'text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>

          <div className='flex items-center space-x-4'>
            {isAuthenticated ? (
              <AccountDropdown userEmail={userEmail} userName={userName} userAvatar={userAvatar} />
            ) : (
              <div className='flex items-center space-x-2'>
                <Button onClick={handleSignIn} variant='outline' className='text-sm'>
                  Sign In
                </Button>
                <Button onClick={handleSignUp} className='text-sm'>
                  Sign Up
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
