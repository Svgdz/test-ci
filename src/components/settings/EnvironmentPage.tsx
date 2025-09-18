'use client'

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Input } from '@/ui/primitives/input'
import { Button } from '@/ui/primitives/button'
import { Select } from '@/ui/primitives/select'
import { Eye, EyeOff, Edit, Trash2, Copy, Check, Plus, FileText, Search } from 'lucide-react'
import {
  getProjectSecrets,
  createProjectSecret,
  updateProjectSecret,
  deleteProjectSecret,
} from '@/server/projects/project-actions'
import { Tables } from '@/types/database.types'

interface EnvironmentPageProps {
  project?: Tables<'projects'>
}

interface Secret {
  id: string
  key: string
  value: string
  created_at: string
  updated_at: string
  vault_error?: string | null
}

export const EnvironmentPage = memo(({ project: _project }: EnvironmentPageProps) => {
  const params = useParams()
  const projectId = params?.projectId as string

  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('Filters')
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set())
  const [copiedSecrets, setCopiedSecrets] = useState<Set<string>>(new Set())
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSecret, setEditingSecret] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState({ key: '', value: '' })
  const [editSecret, setEditSecret] = useState({ key: '', value: '' })

  // Load secrets function
  const loadSecrets = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getProjectSecrets({ projectId })
      if (response.serverError) {
        setError(response.serverError)
        return
      }

      const loadedSecrets = response.data?.secrets || []
      const secretsArray = loadedSecrets.map(
        (
          secret: {
            key: string
            value?: string
            vault_error?: string | null
          },
          index: number
        ) => ({
          id: `secret-${index}`,
          key: secret.key,
          value: secret.value || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          vault_error: secret.vault_error || undefined,
        })
      )
      setSecrets(secretsArray)
    } catch (err) {
      console.error('Failed to load environment variables:', err)
      setError('Failed to load environment variables')
    } finally {
      setIsLoading(false)
    }
  }

  // Load secrets on component mount
  useEffect(() => {
    if (projectId) {
      void loadSecrets()
    }
  }, [projectId])

  const toggleSecretVisibility = (secretId: string) => {
    const newVisibleSecrets = new Set(visibleSecrets)
    if (newVisibleSecrets.has(secretId)) {
      newVisibleSecrets.delete(secretId)
    } else {
      newVisibleSecrets.add(secretId)
    }
    setVisibleSecrets(newVisibleSecrets)
  }

  const maskValue = (value: string) => {
    return '•'.repeat(Math.min(value.length, 12))
  }

  const copyToClipboard = async (secretId: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)

      // Show check icon
      setCopiedSecrets((prev) => new Set(prev).add(secretId))

      // Revert back to copy icon after 2 seconds
      setTimeout(() => {
        setCopiedSecrets((prev) => {
          const newSet = new Set(prev)
          newSet.delete(secretId)
          return newSet
        })
      }, 2000)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  const handleAddSecret = async () => {
    if (!projectId || !newSecret.key || !newSecret.value) return

    setIsSaving(true)
    setError(null)

    try {
      const result = await createProjectSecret({
        projectId,
        key: newSecret.key,
        value: newSecret.value,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      setNewSecret({ key: '', value: '' })
      setShowAddForm(false)
      setSuccess('Secret added successfully')
      setTimeout(() => setSuccess(null), 3000)
      await loadSecrets()
    } catch (err) {
      console.error('Failed to add secret:', err)
      setError('Failed to add secret')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditSecret = async (secretId: string) => {
    if (!projectId || !editSecret.key) return

    setIsSaving(true)
    setError(null)

    try {
      const result = await updateProjectSecret({
        projectId,
        secretId,
        key: editSecret.key,
        value: editSecret.value,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      setEditingSecret(null)
      setEditSecret({ key: '', value: '' })
      setSuccess('Secret updated successfully')
      setTimeout(() => setSuccess(null), 3000)
      await loadSecrets()
    } catch (err) {
      console.error('Failed to update secret:', err)
      setError('Failed to update secret')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSecret = async (secretId: string) => {
    if (!projectId) return

    if (!confirm('Are you sure you want to delete this secret?')) return

    setIsSaving(true)
    setError(null)

    try {
      const result = await deleteProjectSecret({
        projectId,
        secretId,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      setSuccess('Secret deleted successfully')
      setTimeout(() => setSuccess(null), 3000)
      await loadSecrets()
    } catch (err) {
      console.error('Failed to delete secret:', err)
      setError('Failed to delete secret')
    } finally {
      setIsSaving(false)
    }
  }

  const startEdit = (secret: Secret) => {
    setEditingSecret(secret.id)
    setEditSecret({ key: secret.key, value: secret.value })
  }

  const cancelEdit = () => {
    setEditingSecret(null)
    setEditSecret({ key: '', value: '' })
  }

  const filteredSecrets = secrets.filter((secret) =>
    secret.key.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className='space-y-6'>
        <div className='animate-pulse'>
          <div className='h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2'></div>
          <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3'></div>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-start justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2'>Secrets</h1>
          <p className='text-gray-600 dark:text-gray-400'>
            Secrets are saved in Aibexx Vault and encrypted at rest. Only your project has access.
          </p>
        </div>

        {/* Action Buttons */}
        <div className='flex gap-3'>
          <Button variant='outline' className='flex items-center gap-2'>
            <FileText size={16} />
            Raw Editor
          </Button>
          <Button
            onClick={() => setShowAddForm(true)}
            className='flex items-center gap-2 bg-blue-600 hover:bg-blue-700'
          >
            <Plus size={16} />
            Add Secret
          </Button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4'>
          <p className='text-red-800 dark:text-red-200 text-sm'>{error}</p>
        </div>
      )}

      {success && (
        <div className='bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4'>
          <p className='text-green-800 dark:text-green-200 text-sm'>{success}</p>
        </div>
      )}

      {/* Add Secret Form */}
      {showAddForm && (
        <div className='bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4'>
            Add New Secret
          </h3>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                Key
              </label>
              <Input
                value={newSecret.key}
                onChange={(e) => setNewSecret({ ...newSecret, key: e.target.value })}
                placeholder='SECRET_KEY'
                className='w-full'
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                Value
              </label>
              <Input
                value={newSecret.value}
                onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                placeholder='secret_value'
                className='w-full'
              />
            </div>
          </div>
          <div className='flex gap-2 mt-4'>
            <Button
              onClick={() => void handleAddSecret()}
              disabled={isSaving || !newSecret.key || !newSecret.value}
              className='bg-blue-600 hover:bg-blue-700'
            >
              {isSaving ? 'Adding...' : 'Add Secret'}
            </Button>
            <Button
              onClick={() => {
                setShowAddForm(false)
                setNewSecret({ key: '', value: '' })
              }}
              variant='outline'
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Search and Sort */}
      <div className='flex items-center justify-between gap-4'>
        <div className='relative flex-1 max-w-2xl'>
          <div className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400'>
            <Search size={16} />
          </div>
          <Input
            type='text'
            placeholder='Search secrets...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='pl-10'
          />
        </div>

        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className='min-w-[140px] w-[140px]'
        >
          <option value='Filters' disabled>
            Filters
          </option>
          <option value='Last Updated'>Last Updated</option>
          <option value='Name'>Name</option>
          <option value='Created'>Created</option>
        </Select>
      </div>

      {/* Secrets Table */}
      <div className='bg-white border border-gray-200 rounded-lg overflow-hidden'>
        {/* Table Header */}
        <div className='grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700'>
          <div className='col-span-4'>Key</div>
          <div className='col-span-6'>Value</div>
          <div className='col-span-2'>Actions</div>
        </div>

        {/* Table Rows */}
        {filteredSecrets.length > 0 ? (
          filteredSecrets.map((secret) => {
            const isVisible = visibleSecrets.has(secret.id)
            const isCopied = copiedSecrets.has(secret.id)
            const isEditing = editingSecret === secret.id

            if (isEditing) {
              return (
                <div
                  key={secret.id}
                  className='grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-100 bg-blue-50 dark:bg-blue-900/20'
                >
                  <div className='col-span-4'>
                    <Input
                      value={editSecret.key}
                      onChange={(e) => setEditSecret({ ...editSecret, key: e.target.value })}
                      className='w-full'
                    />
                  </div>
                  <div className='col-span-6'>
                    <Input
                      value={editSecret.value}
                      onChange={(e) => setEditSecret({ ...editSecret, value: e.target.value })}
                      className='w-full'
                    />
                  </div>
                  <div className='col-span-2 flex items-center gap-2'>
                    <button
                      onClick={() => void handleEditSecret(secret.id)}
                      disabled={isSaving}
                      className='text-green-600 hover:text-green-700 transition-colors p-1'
                      title='Save changes'
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className='text-gray-400 hover:text-gray-600 transition-colors p-1'
                      title='Cancel edit'
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={secret.id}
                className='grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors'
              >
                <div className='col-span-4'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium text-gray-900'>{secret.key}</span>
                    {secret.vault_error && (
                      <span
                        className='text-xs text-red-500 bg-red-50 px-2 py-1 rounded cursor-help'
                        title={`Vault Error: ${secret.vault_error}`}
                      >
                        Vault Error
                      </span>
                    )}
                  </div>
                </div>
                <div className='col-span-6 flex items-center gap-2 min-w-0'>
                  <span className='text-gray-600 font-mono flex-1 truncate overflow-hidden'>
                    {isVisible ? secret.value : maskValue(secret.value)}
                  </span>
                  <button
                    onClick={() => toggleSecretVisibility(secret.id)}
                    className='text-gray-400 hover:text-gray-600 transition-colors p-1 flex-shrink-0'
                    title={isVisible ? 'Hide value' : 'Show value'}
                  >
                    {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    onClick={() => void copyToClipboard(secret.id, secret.value)}
                    className={`transition-colors p-1 flex-shrink-0 ${
                      isCopied
                        ? 'text-green-500 hover:text-green-600'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title={isCopied ? 'Copied!' : 'Copy to clipboard'}
                  >
                    {isCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <div className='col-span-2 flex items-center gap-2'>
                  <button
                    onClick={() => startEdit(secret)}
                    className='text-gray-400 hover:text-blue-600 transition-colors p-1'
                    title='Edit secret'
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => void handleDeleteSecret(secret.id)}
                    className='text-gray-400 hover:text-red-600 transition-colors p-1'
                    title='Delete secret'
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <div className='px-6 py-12 text-center'>
            <div className='i-ph:key w-12 h-12 text-gray-300 mx-auto mb-4' />
            <h3 className='text-lg font-medium text-gray-900 mb-2'>No secrets found</h3>
            <p className='text-gray-600 mb-4'>
              {searchTerm
                ? 'No secrets match your search.'
                : 'Get started by adding your first secret.'}
            </p>
            <Button className='bg-blue-600 hover:bg-blue-700'>
              <div className='i-ph:plus w-4 h-4 mr-2' />
              Add Secret
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})

EnvironmentPage.displayName = 'EnvironmentPage'
