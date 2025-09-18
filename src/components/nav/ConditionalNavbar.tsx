'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'

interface ConditionalNavbarProps {
  isAuthenticated: boolean
  userEmail?: string
  userName?: string
  userAvatar?: string
}

export function ConditionalNavbar({
  isAuthenticated,
  userEmail,
  userName,
  userAvatar,
}: ConditionalNavbarProps) {
  const pathname = usePathname()

  // Don't show main navbar on workspace pages
  const isWorkspacePage = pathname?.startsWith('/workspace/')

  if (isWorkspacePage) {
    return null
  }

  return (
    <Navbar
      isAuthenticated={isAuthenticated}
      userEmail={userEmail}
      userName={userName}
      userAvatar={userAvatar}
    />
  )
}
