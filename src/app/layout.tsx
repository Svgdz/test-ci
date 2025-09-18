import type { Metadata } from 'next'
import './globals.css'
import { ConditionalNavbar } from '@/components/nav/ConditionalNavbar'
import { ToastContainer } from 'react-toastify'
import { getSessionInsecure } from '@/server/auth/get-session'

export const metadata: Metadata = {
  title: 'AIBEXX',
  description: 'AI-powered development platform',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSessionInsecure()
  const isAuthenticated = !!session

  // Extract user data from session
  const userEmail = session?.user?.email
  const userName =
    (session?.user?.user_metadata as { full_name?: string; name?: string })?.full_name ||
    (session?.user?.user_metadata as { name?: string })?.name
  const userAvatar = (session?.user?.user_metadata as { avatar_url?: string })?.avatar_url

  return (
    <html lang='en' className='h-full'>
      <body className='antialiased h-full'>
        <ConditionalNavbar
          isAuthenticated={isAuthenticated}
          userEmail={userEmail}
          userName={userName}
          userAvatar={userAvatar}
        />
        <div className='h-[calc(100vh-4rem)]'>{children}</div>
        <ToastContainer
          position='top-right'
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          theme='light'
        />
      </body>
    </html>
  )
}
