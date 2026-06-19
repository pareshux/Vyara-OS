export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity: {
        Row: {
          actor_id: string | null
          content: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          project_id: string | null
          tenant_id: string
          type: string
          type_id: string | null
        }
        Insert: {
          actor_id?: string | null
          content?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          project_id?: string | null
          tenant_id: string
          type: string
          type_id?: string | null
        }
        Update: {
          actor_id?: string | null
          content?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          project_id?: string | null
          tenant_id?: string
          type?: string
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "activity_type_master"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_type_master: {
        Row: {
          category: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          module_code: string | null
          notes: string | null
          sort_order: number
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          module_code?: string | null
          notes?: string | null
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          module_code?: string | null
          notes?: string | null
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_type_master_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_extraction: {
        Row: {
          cache_read_tokens: number | null
          created_at: string
          created_by: string | null
          entity_kind: string
          error_detail: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          parsed_output: Json | null
          prompt_version: string
          raw_output: Json | null
          source_mime_type: string | null
          source_size_bytes: number | null
          source_storage_path: string
          status: string
          tenant_id: string
        }
        Insert: {
          cache_read_tokens?: number | null
          created_at?: string
          created_by?: string | null
          entity_kind: string
          error_detail?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          parsed_output?: Json | null
          prompt_version: string
          raw_output?: Json | null
          source_mime_type?: string | null
          source_size_bytes?: number | null
          source_storage_path: string
          status: string
          tenant_id: string
        }
        Update: {
          cache_read_tokens?: number | null
          created_at?: string
          created_by?: string | null
          entity_kind?: string
          error_detail?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          parsed_output?: Json | null
          prompt_version?: string
          raw_output?: Json | null
          source_mime_type?: string | null
          source_size_bytes?: number | null
          source_storage_path?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_extraction_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_extraction_row: {
        Row: {
          avg_confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          extraction_id: string
          final_values: Json | null
          id: string
          original_values: Json
          row_index: number
          target_entity_id: string | null
          target_entity_type: string | null
          tenant_id: string
        }
        Insert: {
          avg_confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          extraction_id: string
          final_values?: Json | null
          id?: string
          original_values: Json
          row_index: number
          target_entity_id?: string | null
          target_entity_type?: string | null
          tenant_id: string
        }
        Update: {
          avg_confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          extraction_id?: string
          final_values?: Json | null
          id?: string
          original_values?: Json
          row_index?: number
          target_entity_id?: string | null
          target_entity_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_extraction_row_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "ai_extraction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_extraction_row_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      collection: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          current_stage_id: string
          deleted_at: string | null
          escalation_level: number
          id: string
          invoice_id: string
          last_dunning_at: string | null
          next_action_at: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id: string
          deleted_at?: string | null
          escalation_level?: number
          id?: string
          invoice_id: string
          last_dunning_at?: string | null
          next_action_at?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string
          deleted_at?: string | null
          escalation_level?: number
          id?: string
          invoice_id?: string
          last_dunning_at?: string | null
          next_action_at?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "collection_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoice_ageing_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_activity: {
        Row: {
          channel: string
          collection_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          notes: string | null
          outcome: string
          payload: Json
          template_key: string | null
          tenant_id: string
        }
        Insert: {
          channel: string
          collection_id: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          outcome: string
          payload?: Json
          template_key?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string
          collection_id?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          outcome?: string
          payload?: Json
          template_key?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_activity_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_stage: {
        Row: {
          color: string
          created_at: string
          id: string
          is_terminal: boolean
          label: string
          order_index: number
          stage_key: string
          tenant_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          label: string
          order_index: number
          stage_key: string
          tenant_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          label?: string
          order_index?: number
          stage_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_stage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_stage_history: {
        Row: {
          actor_id: string | null
          collection_id: string
          created_at: string
          from_stage_id: string | null
          id: string
          remark: string | null
          tenant_id: string
          to_stage_id: string
        }
        Insert: {
          actor_id?: string | null
          collection_id: string
          created_at?: string
          from_stage_id?: string | null
          id?: string
          remark?: string | null
          tenant_id: string
          to_stage_id: string
        }
        Update: {
          actor_id?: string | null
          collection_id?: string
          created_at?: string
          from_stage_id?: string | null
          id?: string
          remark?: string | null
          tenant_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_stage_history_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "collection_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "collection_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          firm_id: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role_title: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          firm_id?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role_title?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          firm_id?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role_title?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_digest: {
        Row: {
          digest_date: string
          focus_items: Json
          generated_at: string
          generated_by: string | null
          health_signal: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          narrative_text: string
          output_tokens: number | null
          prompt_version: string
          stats: Json
          tenant_id: string
        }
        Insert: {
          digest_date: string
          focus_items?: Json
          generated_at?: string
          generated_by?: string | null
          health_signal?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          narrative_text: string
          output_tokens?: number | null
          prompt_version: string
          stats: Json
          tenant_id: string
        }
        Update: {
          digest_date?: string
          focus_items?: Json
          generated_at?: string
          generated_by?: string | null
          health_signal?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          narrative_text?: string
          output_tokens?: number | null
          prompt_version?: string
          stats?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_digest_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer: {
        Row: {
          created_at: string
          created_by: string | null
          credit_limit: number | null
          credit_period_days: number
          dealer_code: string
          default_payment_term_id: string | null
          default_project_id: string | null
          deleted_at: string | null
          dormancy_threshold_days: number
          firm_id: string
          id: string
          is_active: boolean
          notes: string | null
          onboarded_at: string
          tenant_id: string
          territory: string | null
          territory_id: string | null
          tier: string | null
          tier_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          credit_period_days?: number
          dealer_code: string
          default_payment_term_id?: string | null
          default_project_id?: string | null
          deleted_at?: string | null
          dormancy_threshold_days?: number
          firm_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          onboarded_at?: string
          tenant_id: string
          territory?: string | null
          territory_id?: string | null
          tier?: string | null
          tier_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          credit_period_days?: number
          dealer_code?: string
          default_payment_term_id?: string | null
          default_project_id?: string | null
          deleted_at?: string | null
          dormancy_threshold_days?: number
          firm_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          onboarded_at?: string
          tenant_id?: string
          territory?: string | null
          territory_id?: string | null
          tier?: string | null
          tier_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_default_payment_term_id_fkey"
            columns: ["default_payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_term"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "dealer_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_tier: {
        Row: {
          bg_color: string
          code: string
          color: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          notes: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bg_color?: string
          code: string
          color?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bg_color?: string
          code?: string
          color?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_tier_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_user: {
        Row: {
          accepted_at: string | null
          auth_user_id: string
          dealer_id: string
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id: string
          dealer_id: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string
          dealer_id?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_user_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_user_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch: {
        Row: {
          created_at: string
          created_by: string | null
          current_stage_id: string
          deleted_at: string | null
          delivered_at: string | null
          dispatch_number: string
          dispatched_at: string | null
          driver_phone: string | null
          id: string
          lr_number: string | null
          notes: string | null
          owner_id: string
          pod_signature_name: string | null
          pod_uploaded_at: string | null
          pod_uploaded_by: string | null
          pod_url: string | null
          project_id: string
          sales_order_id: string
          scheduled_at: string | null
          tenant_id: string
          transporter_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_number: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_stage_id: string
          deleted_at?: string | null
          delivered_at?: string | null
          dispatch_number: string
          dispatched_at?: string | null
          driver_phone?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          owner_id: string
          pod_signature_name?: string | null
          pod_uploaded_at?: string | null
          pod_uploaded_by?: string | null
          pod_url?: string | null
          project_id: string
          sales_order_id: string
          scheduled_at?: string | null
          tenant_id: string
          transporter_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_stage_id?: string
          deleted_at?: string | null
          delivered_at?: string | null
          dispatch_number?: string
          dispatched_at?: string | null
          driver_phone?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          owner_id?: string
          pod_signature_name?: string | null
          pod_uploaded_at?: string | null
          pod_uploaded_by?: string | null
          pod_url?: string | null
          project_id?: string
          sales_order_id?: string
          scheduled_at?: string | null
          tenant_id?: string
          transporter_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_line: {
        Row: {
          dispatch_id: string
          id: string
          notes: string | null
          product_name: string
          quantity: number
          sales_order_line_id: string | null
          sku_code: string
          sort_order: number
          tenant_id: string
          unit: string
        }
        Insert: {
          dispatch_id: string
          id?: string
          notes?: string | null
          product_name: string
          quantity: number
          sales_order_line_id?: string | null
          sku_code: string
          sort_order?: number
          tenant_id: string
          unit: string
        }
        Update: {
          dispatch_id?: string
          id?: string
          notes?: string | null
          product_name?: string
          quantity?: number
          sales_order_line_id?: string | null
          sku_code?: string
          sort_order?: number
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_line_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_line_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_line"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_stage: {
        Row: {
          color: string
          created_at: string
          id: string
          is_terminal: boolean
          label: string
          order_index: number
          stage_key: string
          tenant_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          label: string
          order_index: number
          stage_key: string
          tenant_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          label?: string
          order_index?: number
          stage_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_stage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_stage_history: {
        Row: {
          actor_id: string | null
          created_at: string
          dispatch_id: string
          from_stage_id: string | null
          id: string
          remark: string | null
          tenant_id: string
          to_stage_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dispatch_id: string
          from_stage_id?: string | null
          id?: string
          remark?: string | null
          tenant_id: string
          to_stage_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dispatch_id?: string
          from_stage_id?: string | null
          id?: string
          remark?: string | null
          tenant_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_stage_history_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      field_attendance: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_date: string
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_odometer_km: number | null
          check_in_photo_url: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_odometer_km: number | null
          check_out_photo_url: string | null
          claim_status: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          rate_applied: number | null
          reimbursement_amount: number | null
          rejection_reason: string | null
          status_for_day: string
          submitted_at: string | null
          tenant_id: string
          total_km: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date: string
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_odometer_km?: number | null
          check_in_photo_url?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_odometer_km?: number | null
          check_out_photo_url?: string | null
          claim_status?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          rate_applied?: number | null
          reimbursement_amount?: number | null
          rejection_reason?: string | null
          status_for_day?: string
          submitted_at?: string | null
          tenant_id: string
          total_km?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_odometer_km?: number | null
          check_in_photo_url?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_odometer_km?: number | null
          check_out_photo_url?: string | null
          claim_status?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          rate_applied?: number | null
          reimbursement_amount?: number | null
          rejection_reason?: string | null
          status_for_day?: string
          submitted_at?: string | null
          tenant_id?: string
          total_km?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_attendance_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_attendance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle"
            referencedColumns: ["id"]
          },
        ]
      }
      field_call: {
        Row: {
          attendance_id: string | null
          called_at: string
          channel: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          dealer_id: string | null
          deleted_at: string | null
          direction: string
          duration_seconds: number | null
          firm_id: string | null
          id: string
          lead_id: string | null
          locked_at: string | null
          notes_text: string | null
          project_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          visit_outcome_id: string | null
        }
        Insert: {
          attendance_id?: string | null
          called_at?: string
          channel?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          deleted_at?: string | null
          direction?: string
          duration_seconds?: number | null
          firm_id?: string | null
          id?: string
          lead_id?: string | null
          locked_at?: string | null
          notes_text?: string | null
          project_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          visit_outcome_id?: string | null
        }
        Update: {
          attendance_id?: string | null
          called_at?: string
          channel?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          deleted_at?: string | null
          direction?: string
          duration_seconds?: number | null
          firm_id?: string | null
          id?: string
          lead_id?: string | null
          locked_at?: string | null
          notes_text?: string | null
          project_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          visit_outcome_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_call_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "field_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_call_visit_outcome_id_fkey"
            columns: ["visit_outcome_id"]
            isOneToOne: false
            referencedRelation: "visit_outcome"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visit: {
        Row: {
          ai_extracted_payload: Json | null
          attendance_id: string | null
          contact_id: string | null
          contact_name_raw: string | null
          contact_phone_raw: string | null
          created_at: string
          created_by: string | null
          dealer_id: string | null
          deleted_at: string | null
          duration_minutes: number | null
          firm_id: string | null
          id: string
          is_interested: boolean | null
          lat: number | null
          lead_id: string | null
          lng: number | null
          location_label: string | null
          locked_at: string | null
          notes_text: string | null
          odometer_km_at_arrival: number | null
          odometer_photo_url: string | null
          photo_urls: string[]
          planned_task_id: string | null
          project_id: string | null
          started_at: string | null
          state: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          visit_outcome_id: string | null
          visit_purpose_id: string | null
          visited_at: string
          voice_note_url: string | null
        }
        Insert: {
          ai_extracted_payload?: Json | null
          attendance_id?: string | null
          contact_id?: string | null
          contact_name_raw?: string | null
          contact_phone_raw?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          firm_id?: string | null
          id?: string
          is_interested?: boolean | null
          lat?: number | null
          lead_id?: string | null
          lng?: number | null
          location_label?: string | null
          locked_at?: string | null
          notes_text?: string | null
          odometer_km_at_arrival?: number | null
          odometer_photo_url?: string | null
          photo_urls?: string[]
          planned_task_id?: string | null
          project_id?: string | null
          started_at?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          visit_outcome_id?: string | null
          visit_purpose_id?: string | null
          visited_at?: string
          voice_note_url?: string | null
        }
        Update: {
          ai_extracted_payload?: Json | null
          attendance_id?: string | null
          contact_id?: string | null
          contact_name_raw?: string | null
          contact_phone_raw?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          firm_id?: string | null
          id?: string
          is_interested?: boolean | null
          lat?: number | null
          lead_id?: string | null
          lng?: number | null
          location_label?: string | null
          locked_at?: string | null
          notes_text?: string | null
          odometer_km_at_arrival?: number | null
          odometer_photo_url?: string | null
          photo_urls?: string[]
          planned_task_id?: string | null
          project_id?: string | null
          started_at?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          visit_outcome_id?: string | null
          visit_purpose_id?: string | null
          visited_at?: string
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_visit_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "field_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_planned_task_id_fkey"
            columns: ["planned_task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_visit_outcome_id_fkey"
            columns: ["visit_outcome_id"]
            isOneToOne: false
            referencedRelation: "visit_outcome"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_visit_purpose_id_fkey"
            columns: ["visit_purpose_id"]
            isOneToOne: false
            referencedRelation: "visit_purpose"
            referencedColumns: ["id"]
          },
        ]
      }
      firm: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          default_payment_term_id: string | null
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string
          tenant_id: string
          type: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          default_payment_term_id?: string | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string
          tenant_id: string
          type: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          default_payment_term_id?: string | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_default_payment_term_id_fkey"
            columns: ["default_payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_term"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_type: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_type_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_requirement: {
        Row: {
          created_at: string
          id: string
          is_hard: boolean
          label: string
          pipeline_stage_id: string | null
          pipeline_substage_id: string | null
          required_document_type: string | null
          required_field_name: string | null
          sort_order: number
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_hard?: boolean
          label: string
          pipeline_stage_id?: string | null
          pipeline_substage_id?: string | null
          required_document_type?: string | null
          required_field_name?: string | null
          sort_order?: number
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_hard?: boolean
          label?: string
          pipeline_stage_id?: string | null
          pipeline_substage_id?: string | null
          required_document_type?: string | null
          required_field_name?: string | null
          sort_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_requirement_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_requirement_pipeline_substage_id_fkey"
            columns: ["pipeline_substage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_substage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_requirement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice: {
        Row: {
          billed_amount: number
          buyer_firm_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string
          external_invoice_number: string | null
          gst_amount: number
          gst_pct: number
          id: string
          invoice_date: string
          invoice_number: string
          is_final_bill: boolean
          is_running_bill: boolean
          notes: string | null
          paid_amount: number
          payment_term_id: string | null
          payment_terms_days: number
          project_id: string | null
          retention_amount: number
          retention_pct: number
          retention_released_at: string | null
          retention_released_by: string | null
          running_bill_seq: number | null
          sales_order_id: string | null
          source: string
          source_metadata: Json
          status: string
          subtotal: number
          synced_at: string | null
          tax_rate_id: string | null
          tenant_id: string
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billed_amount?: number
          buyer_firm_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date: string
          external_invoice_number?: string | null
          gst_amount?: number
          gst_pct?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          is_final_bill?: boolean
          is_running_bill?: boolean
          notes?: string | null
          paid_amount?: number
          payment_term_id?: string | null
          payment_terms_days?: number
          project_id?: string | null
          retention_amount?: number
          retention_pct?: number
          retention_released_at?: string | null
          retention_released_by?: string | null
          running_bill_seq?: number | null
          sales_order_id?: string | null
          source?: string
          source_metadata?: Json
          status?: string
          subtotal?: number
          synced_at?: string | null
          tax_rate_id?: string | null
          tenant_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billed_amount?: number
          buyer_firm_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string
          external_invoice_number?: string | null
          gst_amount?: number
          gst_pct?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_final_bill?: boolean
          is_running_bill?: boolean
          notes?: string | null
          paid_amount?: number
          payment_term_id?: string | null
          payment_terms_days?: number
          project_id?: string | null
          retention_amount?: number
          retention_pct?: number
          retention_released_at?: string | null
          retention_released_by?: string | null
          running_bill_seq?: number | null
          sales_order_id?: string | null
          source?: string
          source_metadata?: Json
          status?: string
          subtotal?: number
          synced_at?: string | null
          tax_rate_id?: string | null
          tenant_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_buyer_firm_id_fkey"
            columns: ["buyer_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_term"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line: {
        Row: {
          description: string
          id: string
          invoice_id: string
          line_total: number
          quantity: number | null
          sku_code: string | null
          sort_order: number
          tenant_id: string
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          line_total: number
          quantity?: number | null
          sku_code?: string | null
          sort_order?: number
          tenant_id: string
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          quantity?: number | null
          sku_code?: string | null
          sort_order?: number
          tenant_id?: string
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_ageing_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      lead: {
        Row: {
          architect_firm_id: string | null
          buyer_firm_id: string | null
          city: string | null
          contact_email_raw: string | null
          contact_name_raw: string | null
          contact_phone_raw: string | null
          created_at: string
          created_by: string | null
          current_stage_id: string
          custom_fields: Json
          deleted_at: string | null
          estimated_value: number | null
          expected_close_at: string | null
          id: string
          last_activity_at: string
          lead_number: string
          lost_at: string | null
          lost_reason_id: string | null
          lost_remark: string | null
          notes: string | null
          owner_id: string
          primary_contact_id: string | null
          segment: string
          source_id: string | null
          state: string
          tenant_id: string
          territory: string | null
          title: string
          updated_at: string
          updated_by: string | null
          won_at: string | null
          won_project_id: string | null
        }
        Insert: {
          architect_firm_id?: string | null
          buyer_firm_id?: string | null
          city?: string | null
          contact_email_raw?: string | null
          contact_name_raw?: string | null
          contact_phone_raw?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id: string
          custom_fields?: Json
          deleted_at?: string | null
          estimated_value?: number | null
          expected_close_at?: string | null
          id?: string
          last_activity_at?: string
          lead_number: string
          lost_at?: string | null
          lost_reason_id?: string | null
          lost_remark?: string | null
          notes?: string | null
          owner_id: string
          primary_contact_id?: string | null
          segment?: string
          source_id?: string | null
          state?: string
          tenant_id: string
          territory?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          won_at?: string | null
          won_project_id?: string | null
        }
        Update: {
          architect_firm_id?: string | null
          buyer_firm_id?: string | null
          city?: string | null
          contact_email_raw?: string | null
          contact_name_raw?: string | null
          contact_phone_raw?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string
          custom_fields?: Json
          deleted_at?: string | null
          estimated_value?: number | null
          expected_close_at?: string | null
          id?: string
          last_activity_at?: string
          lead_number?: string
          lost_at?: string | null
          lost_reason_id?: string | null
          lost_remark?: string | null
          notes?: string | null
          owner_id?: string
          primary_contact_id?: string | null
          segment?: string
          source_id?: string | null
          state?: string
          tenant_id?: string
          territory?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          won_at?: string | null
          won_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_architect_firm_id_fkey"
            columns: ["architect_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_buyer_firm_id_fkey"
            columns: ["buyer_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_lost_reason_id_fkey"
            columns: ["lost_reason_id"]
            isOneToOne: false
            referencedRelation: "lead_loss_reason"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_won_project_id_fkey"
            columns: ["won_project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_loss_reason: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_loss_reason_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          notes: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_source_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_terminal: boolean
          is_won: boolean
          label: string
          order_index: number
          sla_days: number | null
          stage_key: string
          tenant_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_terminal?: boolean
          is_won?: boolean
          label: string
          order_index: number
          sla_days?: number | null
          stage_key: string
          tenant_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_terminal?: boolean
          is_won?: boolean
          label?: string
          order_index?: number
          sla_days?: number | null
          stage_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage_id: string | null
          id: string
          lead_id: string
          remark: string | null
          tenant_id: string
          to_stage_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          lead_id: string
          remark?: string | null
          tenant_id: string
          to_stage_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          remark?: string | null
          tenant_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          project_id: string | null
          read_at: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          project_id?: string | null
          read_at?: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          project_id?: string | null
          read_at?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stage: {
        Row: {
          color: string
          created_at: string
          id: string
          is_terminal: boolean
          label: string
          order_index: number
          stage_key: string
          tenant_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          label: string
          order_index: number
          stage_key: string
          tenant_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          label?: string
          order_index?: number
          stage_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_stage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_term: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          days: number
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          days: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          days?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_term_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stage: {
        Row: {
          color: string
          created_at: string
          id: string
          is_paving_stage: boolean
          is_terminal: boolean
          label: string
          order_index: number
          segment: string
          sla_days: number | null
          stage_key: string
          tenant_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_paving_stage?: boolean
          is_terminal?: boolean
          label: string
          order_index: number
          segment?: string
          sla_days?: number | null
          stage_key: string
          tenant_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_paving_stage?: boolean
          is_terminal?: boolean
          label?: string
          order_index?: number
          segment?: string
          sla_days?: number | null
          stage_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_substage: {
        Row: {
          color: string
          created_at: string
          id: string
          is_watch_stage: boolean
          label: string
          notes: string | null
          order_index: number
          pipeline_stage_id: string
          sla_days: number | null
          substage_key: string
          tenant_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_watch_stage?: boolean
          label: string
          notes?: string | null
          order_index: number
          pipeline_stage_id: string
          sla_days?: number | null
          substage_key: string
          tenant_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_watch_stage?: boolean
          label?: string
          notes?: string | null
          order_index?: number
          pipeline_stage_id?: string
          sla_days?: number | null
          substage_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_substage_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_substage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          notes: string | null
          region: string | null
          segment: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          notes?: string | null
          region?: string | null
          segment?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          notes?: string | null
          region?: string | null
          segment?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_entry: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          min_qty: number
          notes: string | null
          price_list_id: string
          product_id: string
          tenant_id: string
          unit_price: number
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          min_qty?: number
          notes?: string | null
          price_list_id: string
          product_id: string
          tenant_id: string
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          min_qty?: number
          notes?: string | null
          price_list_id?: string
          product_id?: string
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_entry_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_entry_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_entry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      product: {
        Row: {
          base_price: number | null
          category: string
          created_at: string
          default_tax_rate_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          mrp: number | null
          name: string
          sku_code: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          base_price?: number | null
          category?: string
          created_at?: string
          default_tax_rate_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          mrp?: number | null
          name: string
          sku_code: string
          tenant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          base_price?: number | null
          category?: string
          created_at?: string
          default_tax_rate_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          mrp?: number | null
          name?: string
          sku_code?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_default_tax_rate_id_fkey"
            columns: ["default_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      project: {
        Row: {
          architect_firm_id: string | null
          buyer_firm_id: string | null
          city: string | null
          created_at: string
          created_by: string | null
          current_stage_id: string
          custom_fields: Json
          deleted_at: string | null
          estimated_value: number | null
          id: string
          loss_reason_code: string | null
          name: string
          order_value: number | null
          owner_id: string
          segment: string
          state: string
          tenant_id: string
          territory: string | null
          updated_at: string
          updated_by: string | null
          won_quote_id: string | null
        }
        Insert: {
          architect_firm_id?: string | null
          buyer_firm_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id: string
          custom_fields?: Json
          deleted_at?: string | null
          estimated_value?: number | null
          id?: string
          loss_reason_code?: string | null
          name: string
          order_value?: number | null
          owner_id: string
          segment?: string
          state?: string
          tenant_id: string
          territory?: string | null
          updated_at?: string
          updated_by?: string | null
          won_quote_id?: string | null
        }
        Update: {
          architect_firm_id?: string | null
          buyer_firm_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string
          custom_fields?: Json
          deleted_at?: string | null
          estimated_value?: number | null
          id?: string
          loss_reason_code?: string | null
          name?: string
          order_value?: number | null
          owner_id?: string
          segment?: string
          state?: string
          tenant_id?: string
          territory?: string | null
          updated_at?: string
          updated_by?: string | null
          won_quote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_architect_firm_id_fkey"
            columns: ["architect_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_buyer_firm_id_fkey"
            columns: ["buyer_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_won_quote_fk"
            columns: ["won_quote_id"]
            isOneToOne: false
            referencedRelation: "quotation"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stage_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage_id: string | null
          id: string
          project_id: string
          remark: string | null
          tenant_id: string
          to_stage_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          project_id: string
          remark?: string | null
          tenant_id: string
          to_stage_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          project_id?: string
          remark?: string | null
          tenant_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stage_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stakeholder: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          project_id: string
          role: string
          tenant_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          project_id: string
          role: string
          tenant_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          project_id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stakeholder_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stakeholder_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stakeholder_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      promise_to_pay: {
        Row: {
          amount: number
          collection_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          honoured_at: string | null
          id: string
          invoice_id: string
          is_honoured: boolean | null
          notes: string | null
          promise_date: string
          tenant_id: string
        }
        Insert: {
          amount: number
          collection_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          honoured_at?: string | null
          id?: string
          invoice_id: string
          is_honoured?: boolean | null
          notes?: string | null
          promise_date: string
          tenant_id: string
        }
        Update: {
          amount?: number
          collection_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          honoured_at?: string | null
          id?: string
          invoice_id?: string
          is_honoured?: boolean | null
          notes?: string | null
          promise_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promise_to_pay_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_to_pay_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_to_pay_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_to_pay_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_ageing_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_to_pay_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_pct: number
          id: string
          notes: string | null
          project_id: string
          quotation_number: string
          sent_at: string | null
          status: string
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_pct?: number
          id?: string
          notes?: string | null
          project_id: string
          quotation_number: string
          sent_at?: string | null
          status?: string
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_pct?: number
          id?: string
          notes?: string | null
          project_id?: string
          quotation_number?: string
          sent_at?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_line: {
        Row: {
          discount_pct: number
          id: string
          line_total: number
          notes: string | null
          price_list_entry_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          quotation_id: string
          sku_code: string
          sort_order: number
          tenant_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          discount_pct?: number
          id?: string
          line_total: number
          notes?: string | null
          price_list_entry_id?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          quotation_id: string
          sku_code: string
          sort_order?: number
          tenant_id: string
          unit: string
          unit_price: number
        }
        Update: {
          discount_pct?: number
          id?: string
          line_total?: number
          notes?: string | null
          price_list_entry_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          quotation_id?: string
          sku_code?: string
          sort_order?: number
          tenant_id?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_line_price_list_entry_id_fkey"
            columns: ["price_list_entry_id"]
            isOneToOne: false
            referencedRelation: "price_list_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_line_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_line_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt: {
        Row: {
          amount: number
          bank_account: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          external_id: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_mode: string
          payment_reference: string | null
          received_at: string
          source: string
          source_metadata: Json
          tenant_id: string
        }
        Insert: {
          amount: number
          bank_account?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_mode: string
          payment_reference?: string | null
          received_at?: string
          source?: string
          source_metadata?: Json
          tenant_id: string
        }
        Update: {
          amount?: number
          bank_account?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_mode?: string
          payment_reference?: string | null
          received_at?: string
          source?: string
          source_metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_ageing_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order: {
        Row: {
          buyer_firm_id: string | null
          created_at: string
          created_by: string | null
          created_via: string
          current_stage_id: string
          deleted_at: string | null
          expected_delivery_at: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          owner_id: string
          project_id: string
          quote_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          buyer_firm_id?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          current_stage_id: string
          deleted_at?: string | null
          expected_delivery_at?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          owner_id: string
          project_id: string
          quote_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Update: {
          buyer_firm_id?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          current_stage_id?: string
          deleted_at?: string | null
          expected_delivery_at?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          owner_id?: string
          project_id?: string
          quote_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_buyer_firm_id_fkey"
            columns: ["buyer_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "order_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_line: {
        Row: {
          id: string
          line_total: number
          notes: string | null
          price_list_entry_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sales_order_id: string
          sku_code: string
          sort_order: number
          tenant_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          notes?: string | null
          price_list_entry_id?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          sales_order_id: string
          sku_code: string
          sort_order?: number
          tenant_id: string
          unit: string
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          notes?: string | null
          price_list_entry_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sales_order_id?: string
          sku_code?: string
          sort_order?: number
          tenant_id?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_line_price_list_entry_id_fkey"
            columns: ["price_list_entry_id"]
            isOneToOne: false
            referencedRelation: "price_list_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_stage_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage_id: string | null
          id: string
          remark: string | null
          sales_order_id: string
          tenant_id: string
          to_stage_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          remark?: string | null
          sales_order_id: string
          tenant_id: string
          to_stage_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          remark?: string | null
          sales_order_id?: string
          tenant_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "order_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_stage_history_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "order_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_request: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivered_at: string | null
          dispatched_at: string | null
          id: string
          notes: string | null
          outcome_notes: string | null
          product_id: string
          project_id: string
          quantity: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          id?: string
          notes?: string | null
          outcome_notes?: string | null
          product_id: string
          project_id: string
          quantity?: number
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          id?: string
          notes?: string | null
          outcome_notes?: string | null
          product_id?: string
          project_id?: string
          quantity?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_request_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_request_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_request_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_request_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      specification: {
        Row: {
          area_sqft: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          finish: string | null
          id: string
          is_confirmed: boolean
          notes: string | null
          product_id: string
          project_id: string
          quantity: number | null
          specified_by_contact_id: string | null
          tenant_id: string
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area_sqft?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finish?: string | null
          id?: string
          is_confirmed?: boolean
          notes?: string | null
          product_id: string
          project_id: string
          quantity?: number | null
          specified_by_contact_id?: string | null
          tenant_id: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area_sqft?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finish?: string | null
          id?: string
          is_confirmed?: boolean
          notes?: string | null
          product_id?: string
          project_id?: string
          quantity?: number | null
          specified_by_contact_id?: string | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "specification_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specification_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specification_specified_by_contact_id_fkey"
            columns: ["specified_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specification_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          available_qty: number
          id: string
          last_movement_at: string | null
          max_level: number | null
          min_level: number | null
          product_id: string
          reserved_qty: number
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          available_qty?: number
          id?: string
          last_movement_at?: string | null
          max_level?: number | null
          min_level?: number | null
          product_id: string
          reserved_qty?: number
          tenant_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          available_qty?: number
          id?: string
          last_movement_at?: string | null
          max_level?: number | null
          min_level?: number | null
          product_id?: string
          reserved_qty?: number
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment: {
        Row: {
          adjustment_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          estimated_value: number | null
          id: string
          movement_id: string | null
          product_id: string
          quantity_delta: number
          reason: string
          rejected_reason: string | null
          requested_by: string | null
          status: string
          tenant_id: string
          warehouse_id: string
        }
        Insert: {
          adjustment_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          movement_id?: string | null
          product_id: string
          quantity_delta: number
          reason: string
          rejected_reason?: string | null
          requested_by?: string | null
          status?: string
          tenant_id: string
          warehouse_id: string
        }
        Update: {
          adjustment_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          movement_id?: string | null
          product_id?: string
          quantity_delta?: number
          reason?: string
          rejected_reason?: string | null
          requested_by?: string | null
          status?: string
          tenant_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movement"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          movement_type: string
          product_id: string
          quantity: number
          reason_code: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          remark: string | null
          tenant_id: string
          warehouse_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          movement_type: string
          product_id: string
          quantity: number
          reason_code?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          remark?: string | null
          tenant_id: string
          warehouse_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          movement_type?: string
          product_id?: string
          quantity?: number
          reason_code?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          remark?: string | null
          tenant_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservation: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          product_id: string
          quantity: number
          related_entity_id: string
          related_entity_type: string
          release_reason: string | null
          released_at: string | null
          status: string
          tenant_id: string
          warehouse_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          product_id: string
          quantity: number
          related_entity_id: string
          related_entity_type: string
          release_reason?: string | null
          released_at?: string | null
          status?: string
          tenant_id: string
          warehouse_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          related_entity_id?: string
          related_entity_type?: string
          release_reason?: string | null
          released_at?: string | null
          status?: string
          tenant_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservation_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservation_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          from_warehouse_id: string
          id: string
          notes: string | null
          scheduled_at: string | null
          shipped_at: string | null
          status: string
          tenant_id: string
          to_warehouse_id: string
          transfer_number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_warehouse_id: string
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          shipped_at?: string | null
          status?: string
          tenant_id: string
          to_warehouse_id: string
          transfer_number: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          shipped_at?: string | null
          status?: string
          tenant_id?: string
          to_warehouse_id?: string
          transfer_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_line: {
        Row: {
          id: string
          notes: string | null
          product_id: string
          quantity: number
          sort_order: number
          stock_transfer_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          sort_order?: number
          stock_transfer_id: string
          tenant_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          sort_order?: number
          stock_transfer_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_line_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_line_stock_transfer_id_fkey"
            columns: ["stock_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tally_drift: {
        Row: {
          created_at: string
          detected_in: string | null
          entity_id: string | null
          entity_type: string
          external_id: string | null
          field: string | null
          id: string
          notes: string | null
          our_value: Json | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tally_value: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          detected_in?: string | null
          entity_id?: string | null
          entity_type: string
          external_id?: string | null
          field?: string | null
          id?: string
          notes?: string | null
          our_value?: Json | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tally_value?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          detected_in?: string | null
          entity_id?: string | null
          entity_type?: string
          external_id?: string | null
          field?: string | null
          id?: string
          notes?: string | null
          our_value?: Json | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tally_value?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tally_drift_detected_in_fkey"
            columns: ["detected_in"]
            isOneToOne: false
            referencedRelation: "tally_sync_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tally_drift_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tally_sync_log: {
        Row: {
          actor_id: string | null
          completed_at: string | null
          created_at: string
          direction: string
          drift_detected: number
          duration_ms: number | null
          errors: Json
          id: string
          invoices_pulled: number
          invoices_pushed: number
          message: string | null
          receipts_pulled: number
          receipts_pushed: number
          started_at: string
          status: string
          tenant_id: string
          trigger: string
        }
        Insert: {
          actor_id?: string | null
          completed_at?: string | null
          created_at?: string
          direction: string
          drift_detected?: number
          duration_ms?: number | null
          errors?: Json
          id?: string
          invoices_pulled?: number
          invoices_pushed?: number
          message?: string | null
          receipts_pulled?: number
          receipts_pushed?: number
          started_at?: string
          status: string
          tenant_id: string
          trigger?: string
        }
        Update: {
          actor_id?: string | null
          completed_at?: string | null
          created_at?: string
          direction?: string
          drift_detected?: number
          duration_ms?: number | null
          errors?: Json
          id?: string
          invoices_pulled?: number
          invoices_pushed?: number
          message?: string | null
          receipts_pulled?: number
          receipts_pushed?: number
          started_at?: string
          status?: string
          tenant_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "tally_sync_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      task: {
        Row: {
          assignee_id: string | null
          contact_id: string | null
          created_at: string
          created_by_id: string | null
          deleted_at: string | null
          description: string | null
          done_at: string | null
          due_at: string | null
          id: string
          is_done: boolean
          priority: string
          project_id: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          tenant_id: string
          title: string
          type: string
          type_id: string | null
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deleted_at?: string | null
          description?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          is_done?: boolean
          priority?: string
          project_id?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          tenant_id: string
          title: string
          type?: string
          type_id?: string | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deleted_at?: string | null
          description?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          is_done?: boolean
          priority?: string
          project_id?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          tenant_id?: string
          title?: string
          type?: string
          type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "task_type_master"
            referencedColumns: ["id"]
          },
        ]
      }
      task_type_master: {
        Row: {
          category: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          module_code: string | null
          notes: string | null
          sort_order: number
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          module_code?: string | null
          notes?: string | null
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          module_code?: string | null
          notes?: string | null
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_type_master_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rate: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          notes: string | null
          rate_pct: number
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          notes?: string | null
          rate_pct: number
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          notes?: string | null
          rate_pct?: number
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rate_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          plan: string
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          plan?: string
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          plan?: string
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      tenant_feature: {
        Row: {
          code: string
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          notes: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          notes?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          notes?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      territory: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          level: number
          notes: string | null
          parent_id: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          level?: number
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          level?: number
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "territory_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "territory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vehicle_count: number | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vehicle_count?: number | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transporter_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: string
          tenant_id: string
          territory: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role: string
          tenant_id: string
          territory?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          tenant_id?: string
          territory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          created_by: string | null
          custom_rate_per_km: number | null
          deleted_at: string | null
          fuel_type_id: string
          id: string
          is_active: boolean
          make_model: string | null
          notes: string | null
          ownership: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vehicle_number: string
          vehicle_type_id: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_rate_per_km?: number | null
          deleted_at?: string | null
          fuel_type_id: string
          id?: string
          is_active?: boolean
          make_model?: string | null
          notes?: string | null
          ownership?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vehicle_number: string
          vehicle_type_id: string
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_rate_per_km?: number | null
          deleted_at?: string | null
          fuel_type_id?: string
          id?: string
          is_active?: boolean
          make_model?: string | null
          notes?: string | null
          ownership?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string
          vehicle_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_type"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_assignment_history: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          ended_at: string | null
          id: string
          reason: string | null
          tenant_id: string
          user_id: string | null
          vehicle_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          tenant_id: string
          user_id?: string | null
          vehicle_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          tenant_id?: string
          user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_assignment_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_assignment_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_assignment_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_reimbursement_rate: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_from: string
          effective_to: string | null
          fuel_type_id: string
          id: string
          notes: string | null
          rate_per_km: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vehicle_type_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          fuel_type_id: string
          id?: string
          notes?: string | null
          rate_per_km: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vehicle_type_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          fuel_type_id?: string
          id?: string
          notes?: string | null
          rate_per_km?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_reimbursement_rate_fuel_type_id_fkey"
            columns: ["fuel_type_id"]
            isOneToOne: false
            referencedRelation: "fuel_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_reimbursement_rate_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_reimbursement_rate_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_type"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_type: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_type_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor: {
        Row: {
          address: string | null
          code: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vendor_type: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vendor_type?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vendor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_outcome: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_positive: boolean
          label: string
          requires_followup: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_positive?: boolean
          label: string
          requires_followup?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_positive?: boolean
          label?: string
          requires_followup?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_outcome_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_purpose: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_purpose_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          notes: string | null
          state: string
          tenant_id: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          notes?: string | null
          state?: string
          tenant_id: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          notes?: string | null
          state?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instance: {
        Row: {
          created_at: string
          current_stage: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          sla_deadline_at: string | null
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stage: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          sla_deadline_at?: string | null
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stage?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          sla_deadline_at?: string | null
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instance_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          segment: string | null
          tenant_id: string
          updated_at: string
          version: number
          workflow_type: string
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          segment?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
          workflow_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          segment?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
          workflow_type?: string
        }
        Relationships: []
      }
      workflow_transition_log: {
        Row: {
          actions_queued: Json
          actor_id: string
          actor_role: string
          created_at: string
          from_stage: string
          guard_results: Json
          id: string
          instance_id: string
          is_back_flow: boolean
          remark: string | null
          tenant_id: string
          to_stage: string
          transition_id: string
        }
        Insert: {
          actions_queued?: Json
          actor_id: string
          actor_role: string
          created_at?: string
          from_stage: string
          guard_results?: Json
          id?: string
          instance_id: string
          is_back_flow?: boolean
          remark?: string | null
          tenant_id: string
          to_stage: string
          transition_id: string
        }
        Update: {
          actions_queued?: Json
          actor_id?: string
          actor_role?: string
          created_at?: string
          from_stage?: string
          guard_results?: Json
          id?: string
          instance_id?: string
          is_back_flow?: boolean
          remark?: string | null
          tenant_id?: string
          to_stage?: string
          transition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transition_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transition_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dealer_ledger_v: {
        Row: {
          credit: number | null
          dealer_id: string | null
          debit: number | null
          description: string | null
          running_balance: number | null
          source_id: string | null
          source_ref: string | null
          tenant_id: string | null
          txn_date: string | null
          txn_type: string | null
        }
        Relationships: []
      }
      invoice_ageing_v: {
        Row: {
          ageing_bucket: string | null
          billed_amount: number | null
          buyer_firm_id: string | null
          days_overdue: number | null
          due_date: string | null
          external_invoice_number: string | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          outstanding: number | null
          paid_amount: number | null
          project_id: string | null
          retention_amount: number | null
          sales_order_id: string | null
          status: string | null
          tenant_id: string | null
          total: number | null
        }
        Insert: {
          ageing_bucket?: never
          billed_amount?: number | null
          buyer_firm_id?: string | null
          days_overdue?: never
          due_date?: string | null
          external_invoice_number?: string | null
          id?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          outstanding?: never
          paid_amount?: number | null
          project_id?: string | null
          retention_amount?: number | null
          sales_order_id?: string | null
          status?: string | null
          tenant_id?: string | null
          total?: number | null
        }
        Update: {
          ageing_bucket?: never
          billed_amount?: number | null
          buyer_firm_id?: string | null
          days_overdue?: never
          due_date?: string | null
          external_invoice_number?: string | null
          id?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          outstanding?: never
          paid_amount?: number | null
          project_id?: string | null
          retention_amount?: number | null
          sales_order_id?: string | null
          status?: string | null
          tenant_id?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_buyer_firm_id_fkey"
            columns: ["buyer_firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      commit_workflow_transition: {
        Args: {
          p_actions_queued: Json
          p_actor_id: string
          p_actor_role: string
          p_from_stage: string
          p_guard_results: Json
          p_instance_id: string
          p_is_back_flow: boolean
          p_remark: string
          p_sla_deadline_at: string
          p_to_stage: string
          p_transition_id: string
        }
        Returns: {
          actions_queued: Json
          actor_id: string
          actor_role: string
          created_at: string
          from_stage: string
          guard_results: Json
          id: string
          instance_id: string
          is_back_flow: boolean
          remark: string | null
          tenant_id: string
          to_stage: string
          transition_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_transition_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_actor_role: { Args: never; Returns: string }
      current_dealer_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_active_price: {
        Args: {
          p_product: string
          p_qty: number
          p_region: string
          p_segment: string
          p_tenant: string
        }
        Returns: {
          entry_id: string
          price_list_id: string
          price_list_label: string
          unit_price: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
