'use client'

import { useState, useRef, useEffect } from 'react'
// X icon import removed - was unused
import {
  SettingsSidebar,
  OverviewPage,
  EnvironmentPage,
  DeploymentPage,
  SecurityPage,
  IntegrationsPage,
  type SettingsSection,
} from '@/components/settings'

interface WorkspaceSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  _sandboxId?: string
  _projectName?: string
}

export function WorkspaceSettingsPanel({
  isOpen,
  onClose,
  _sandboxId,
  _projectName = 'Untitled Project',
}: WorkspaceSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('overview')
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

  // Close panel when clicking outside
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

  if (!isOpen) return null

  return (
    <div className='h-full w-full flex bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100'>
      <div ref={modalRef} className='h-full w-full flex overflow-hidden'>
        {/* Sidebar */}
        <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

        {/* Main Content */}
        <div className='flex-1 overflow-y-auto'>
          {activeSection === 'overview' && <OverviewPage />}
          {activeSection === 'environment' && <EnvironmentPage />}
          {activeSection === 'deployment' && <DeploymentPage />}
          {activeSection === 'security' && <SecurityPage />}
          {activeSection === 'integrations' && <IntegrationsPage />}
        </div>
      </div>
    </div>
  )
}
