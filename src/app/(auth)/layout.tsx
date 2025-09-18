// import { cn } from '@/lib/utils'
// import { GridPattern } from '@/ui/grid-pattern'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex h-[100svh] flex-col'>
      <div className='z-10 flex h-full w-full items-center justify-center px-4'>
        <div className='h-fit border bg-bg w-full max-w-96 p-6'>{children}</div>
      </div>
    </div>
  )
}
