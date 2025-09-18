import { z } from 'zod'

// Schema for project creation
export const CreateProjectSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  template: z.string().default('react-vite'), // Template parameter kept for compatibility but ignored in E2B v2
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

// Schema for getting project
export const GetProjectSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
})

// Schema for getting user projects (no input needed - uses session)
export const GetProjectsSchema = z.object({
  // No input parameters needed - uses authenticated user from session
})

// Schema for updating project status
export const UpdateProjectStatusSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  status: z.enum(['active', 'inactive', 'error']),
})

// Schema for updating project details
export const UpdateProjectSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().min(1, 'Project name is required').optional(),
  description: z.string().optional(),
  visibility: z.enum(['private', 'public']).optional(),
  watermark: z.boolean().optional(),
})

// Schema for deleting project
export const DeleteProjectSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
})

// Schema for project secrets
export const ProjectSecretSchema = z.object({
  key: z.string().min(1, 'Secret key is required'),
  value: z.string().min(1, 'Secret value is required'),
})

export const CreateProjectSecretSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  key: z.string().min(1, 'Secret key is required'),
  value: z.string().min(1, 'Secret value is required'),
})

export const UpdateProjectSecretSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  secretId: z.string().uuid('Invalid secret ID'),
  key: z.string().min(1, 'Secret key is required').optional(),
  value: z.string().min(1, 'Secret value is required').optional(),
})

export const DeleteProjectSecretSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  secretId: z.string().uuid('Invalid secret ID'),
})

// Schema for project settings
export const ProjectSettingsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  // Security settings
  enableHttps: z.boolean().optional(),
  enableCors: z.boolean().optional(),
  allowedOrigins: z.string().optional(),
  // Deployment settings
  buildCommand: z.string().optional(),
  outputDirectory: z.string().optional(),
  autoDeploy: z.boolean().optional(),
  // Integration settings
  githubConnected: z.boolean().optional(),
  databaseConnected: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
})

// Chat schemas
export const ChatRoleSchema = z.enum(['user', 'assistant', 'system'])

export const ChatMessagePartSchema = z.object({
  type: z.literal('text'),
  text: z.string().optional(),
  content: z.string().optional(),
})

export const ChatMessageInputSchema = z.object({
  id: z.string().uuid().optional(),
  role: ChatRoleSchema,
  content: z.string().optional(),
  parts: z.array(ChatMessagePartSchema).optional(),
})

export const GetChatHistorySchema = z.object({
  projectId: z.string().uuid(),
})

export const SaveChatMessagesSchema = z.object({
  projectId: z.string().uuid(),
  messages: z.array(ChatMessageInputSchema).min(1),
})
