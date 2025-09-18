export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)'
  }
  public: {
    Tables: {
      project_secrets: {
        Row: {
          id: string
          project_id: string
          key: string
          vault_secret_name: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          key: string
          vault_secret_name?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          key?: string
          vault_secret_name?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_secrets_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'project_secrets_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_accounts'
            referencedColumns: ['id']
          },
        ]
      }

      vault_secrets: {
        Row: {
          id: string
          name: string
          value: string
          project_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          value: string
          project_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          value?: string
          project_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vault_secrets_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }

      chat_messages: {
        Row: {
          id: string
          project_id: string
          user_id: string | null
          role: string | null
          content: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id?: string | null
          role?: string | null
          content?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string | null
          role?: string | null
          content?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_messages_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_accounts'
            referencedColumns: ['id']
          },
        ]
      }

      credit_balances: {
        Row: {
          account_id: string
          available_credits: number
          month_credits_accumulated: number | null
          last_daily_refill_at: string | null
          last_monthly_refill_at: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          account_id: string
          available_credits?: number
          month_credits_accumulated?: number | null
          last_daily_refill_at?: string | null
          last_monthly_refill_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          account_id?: string
          available_credits?: number
          month_credits_accumulated?: number | null
          last_daily_refill_at?: string | null
          last_monthly_refill_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'credit_balances_account_id_fkey'
            columns: ['account_id']
            isOneToOne: true
            referencedRelation: 'user_accounts'
            referencedColumns: ['id']
          },
        ]
      }

      projects: {
        Row: {
          id: string
          account_id: string
          name: string
          slug: string
          default_domain: string | null
          custom_domain: string | null
          custom_domain_verified: boolean | null
          visibility: string | null
          ai_model: string | null
          watermark: boolean | null
          created_by: string | null
          created_at: string
          updated_at: string
          sandbox_id: string | null
          template: string | null
          description: string | null
          sandbox_status: string | null
          sandbox_last_active: string | null
          sandbox_metadata: Json | null
        }
        Insert: {
          id?: string
          account_id: string
          name: string
          slug: string
          default_domain?: string | null
          custom_domain?: string | null
          custom_domain_verified?: boolean | null
          visibility?: string | null
          ai_model?: string | null
          watermark?: boolean | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          sandbox_id?: string | null
          template?: string | null
          description?: string | null
          sandbox_status?: string | null
          sandbox_last_active?: string | null
          sandbox_metadata?: Json | null
        }
        Update: {
          id?: string
          account_id?: string
          name?: string
          slug?: string
          default_domain?: string | null
          custom_domain?: string | null
          custom_domain_verified?: boolean | null
          visibility?: string | null
          ai_model?: string | null
          watermark?: boolean | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          sandbox_id?: string | null
          template?: string | null
          description?: string | null
          sandbox_status?: string | null
          sandbox_last_active?: string | null
          sandbox_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'projects_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'user_accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'projects_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_accounts'
            referencedColumns: ['id']
          },
        ]
      }

      teams: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      users_teams: {
        Row: {
          id: string
          user_id: string
          team_id: string
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          team_id: string
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          team_id?: string
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'users_teams_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'users_teams_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }

      user_accounts: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          email: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          email?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          email?: string | null
        }
        Relationships: []
      }
    }

    Views: Record<string, never>

    Functions: Record<string, never>

    Enums: {
      [_ in never]: never
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } = {
    schema: keyof DatabaseWithoutInternals
  },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
      ? DefaultSchemaEnumNameOrOptions
      : keyof DefaultSchema['Enums'] = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
      ? DefaultSchemaEnumNameOrOptions
      : keyof DefaultSchema['Enums'],
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals } = {
    schema: keyof DatabaseWithoutInternals
  },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
      ? PublicCompositeTypeNameOrOptions
      : keyof DefaultSchema['CompositeTypes'] = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
      ? PublicCompositeTypeNameOrOptions
      : keyof DefaultSchema['CompositeTypes'],
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
