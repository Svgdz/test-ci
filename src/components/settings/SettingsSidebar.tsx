'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Home, Key, Shield, Zap, Plug } from 'lucide-react'

export type SettingsSection =
  | 'overview'
  | 'environment'
  | 'deployment'
  | 'security'
  | 'integrations'

export interface SettingsSidebarProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

const settingsSections = [
  { id: 'overview' as const, label: 'Overview', icon: Home },
  { id: 'environment' as const, label: 'Secrets', icon: Key },
  { id: 'deployment' as const, label: 'Deployment', icon: Zap },
  { id: 'security' as const, label: 'Security', icon: Shield },
  { id: 'integrations' as const, label: 'Integrations', icon: Plug },
]

export const SettingsSidebar = memo(({ activeSection, onSectionChange }: SettingsSidebarProps) => {
  return (
    <div className='w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'>
      <div className='p-4 border-b border-gray-200 dark:border-gray-700'>
        <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>Workspace</h2>
      </div>

      <nav className='p-2'>
        {settingsSections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors justify-start',
              {
                'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100':
                  activeSection === section.id,
                'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700':
                  activeSection !== section.id,
              }
            )}
          >
            <section.icon className='w-5 h-5' />
            <span className='text-sm font-medium'>{section.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
})

SettingsSidebar.displayName = 'SettingsSidebar'
