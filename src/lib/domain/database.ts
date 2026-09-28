// Generated from Supabase project yvohdlsbjjzsvrxblwoc on 2026-09-28. Regenerate with: npm run db:types
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
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      building_common_area_items: {
        Row: {
          area_id: string
          created_at: string | null
          id: string
          item_text: string
          requires_photo: boolean | null
          sort_order: number | null
        }
        Insert: {
          area_id: string
          created_at?: string | null
          id?: string
          item_text: string
          requires_photo?: boolean | null
          sort_order?: number | null
        }
        Update: {
          area_id?: string
          created_at?: string | null
          id?: string
          item_text?: string
          requires_photo?: boolean | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "building_common_area_items_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "building_common_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      building_common_areas: {
        Row: {
          building_id: string
          created_at: string | null
          frequency_count: number
          frequency_type: string
          id: string
          is_active: boolean | null
          name: string
          requires_photo: boolean | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          building_id: string
          created_at?: string | null
          frequency_count?: number
          frequency_type?: string
          id?: string
          is_active?: boolean | null
          name: string
          requires_photo?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          building_id?: string
          created_at?: string | null
          frequency_count?: number
          frequency_type?: string
          id?: string
          is_active?: boolean | null
          name?: string
          requires_photo?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_common_tasks_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          created_at: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          amenity_key: string | null
          building_area_id: string | null
          building_area_item_id: string | null
          created_at: string | null
          id: string
          item_text: string
          job_id: string | null
          multi_photo: boolean
          photo_url: string | null
          photo_urls: Json
          requires_photo: boolean | null
          section: string
          skip_reason: string | null
          sort_order: number | null
          status: string | null
        }
        Insert: {
          amenity_key?: string | null
          building_area_id?: string | null
          building_area_item_id?: string | null
          created_at?: string | null
          id?: string
          item_text: string
          job_id?: string | null
          multi_photo?: boolean
          photo_url?: string | null
          photo_urls?: Json
          requires_photo?: boolean | null
          section: string
          skip_reason?: string | null
          sort_order?: number | null
          status?: string | null
        }
        Update: {
          amenity_key?: string | null
          building_area_id?: string | null
          building_area_item_id?: string | null
          created_at?: string | null
          id?: string
          item_text?: string
          job_id?: string | null
          multi_photo?: boolean
          photo_url?: string | null
          photo_urls?: Json
          requires_photo?: boolean | null
          section?: string
          skip_reason?: string | null
          sort_order?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_building_area_item_id_fkey"
            columns: ["building_area_item_id"]
            isOneToOne: false
            referencedRelation: "building_common_area_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_building_task_id_fkey"
            columns: ["building_area_id"]
            isOneToOne: false
            referencedRelation: "building_common_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_availability_overrides: {
        Row: {
          cleaner_id: string | null
          created_at: string | null
          id: string
          is_available: boolean
          override_date: string
          reason: string | null
        }
        Insert: {
          cleaner_id?: string | null
          created_at?: string | null
          id?: string
          is_available: boolean
          override_date: string
          reason?: string | null
        }
        Update: {
          cleaner_id?: string | null
          created_at?: string | null
          id?: string
          is_available?: boolean
          override_date?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_availability_overrides_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_followups: {
        Row: {
          ai_confidence: number | null
          created_at: string | null
          id: string
          issue_id: string | null
          job_id: string | null
          property_id: string
          reservation_id: string | null
          source: string | null
          status: string | null
          task_description: string
          updated_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string | null
          id?: string
          issue_id?: string | null
          job_id?: string | null
          property_id: string
          reservation_id?: string | null
          source?: string | null
          status?: string | null
          task_description: string
          updated_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string | null
          id?: string
          issue_id?: string | null
          job_id?: string | null
          property_id?: string
          reservation_id?: string | null
          source?: string | null
          status?: string | null
          task_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_followups_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_followups_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_followups_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_followups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_followups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_followups_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "lane_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_followups_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_notifications: {
        Row: {
          body: string | null
          cleaner_id: string
          created_at: string
          id: string
          is_read: boolean
          job_id: string | null
          property_name: string | null
          scheduled_date: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          cleaner_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          job_id?: string | null
          property_name?: string | null
          scheduled_date?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          cleaner_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          job_id?: string | null
          property_name?: string | null
          scheduled_date?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_notifications_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaners: {
        Row: {
          building_id: string | null
          company: string | null
          created_at: string | null
          daily_capacity: number | null
          day_end: string
          day_start: string
          email: string
          id: string
          is_active: boolean | null
          is_backup: boolean
          is_contractor: boolean | null
          location_lat: number | null
          location_lng: number | null
          max_b2b_per_day: number
          name: string
          phone: string | null
          portfolio: string[] | null
          qualifications: string[] | null
          score: number | null
          tags: string[] | null
          travel_radius_km: number | null
          updated_at: string | null
          user_id: string | null
          working_days: number[] | null
        }
        Insert: {
          building_id?: string | null
          company?: string | null
          created_at?: string | null
          daily_capacity?: number | null
          day_end?: string
          day_start?: string
          email: string
          id?: string
          is_active?: boolean | null
          is_backup?: boolean
          is_contractor?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          max_b2b_per_day?: number
          name: string
          phone?: string | null
          portfolio?: string[] | null
          qualifications?: string[] | null
          score?: number | null
          tags?: string[] | null
          travel_radius_km?: number | null
          updated_at?: string | null
          user_id?: string | null
          working_days?: number[] | null
        }
        Update: {
          building_id?: string | null
          company?: string | null
          created_at?: string | null
          daily_capacity?: number | null
          day_end?: string
          day_start?: string
          email?: string
          id?: string
          is_active?: boolean | null
          is_backup?: boolean
          is_contractor?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          max_b2b_per_day?: number
          name?: string
          phone?: string | null
          portfolio?: string[] | null
          qualifications?: string[] | null
          score?: number | null
          tags?: string[] | null
          travel_radius_km?: number | null
          updated_at?: string | null
          user_id?: string | null
          working_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaners_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_job_history: {
        Row: {
          actor: string | null
          created_at: string | null
          detail: Json | null
          event: string
          id: string
          job_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string | null
          detail?: Json | null
          event: string
          id?: string
          job_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string | null
          detail?: Json | null
          event?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_job_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_jobs: {
        Row: {
          ai_scan_results: Json | null
          ai_scan_status: string | null
          archived_at: string | null
          arriving_value_per_night: number | null
          assignment_reason: string | null
          assignment_source: string
          cleaner_id: string | null
          cleaner_report: Json | null
          completed_at: string | null
          created_at: string | null
          custom_title: string | null
          estimated_minutes: number | null
          float_acknowledged_at: string | null
          float_proposed_date: string | null
          floated_from_date: string | null
          guest_ready_report_url: string | null
          id: string
          importance_note: string | null
          is_b2b: boolean
          is_high_importance: boolean | null
          job_type: string
          late_checkout: boolean
          late_checkout_time: string | null
          needs_review: boolean | null
          planned_at: string | null
          property_id: string | null
          reservation_id: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          route_order: number | null
          scheduled_date: string
          scheduled_time: string | null
          started_at: string | null
          status: string | null
          travel_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          ai_scan_results?: Json | null
          ai_scan_status?: string | null
          archived_at?: string | null
          arriving_value_per_night?: number | null
          assignment_reason?: string | null
          assignment_source?: string
          cleaner_id?: string | null
          cleaner_report?: Json | null
          completed_at?: string | null
          created_at?: string | null
          custom_title?: string | null
          estimated_minutes?: number | null
          float_acknowledged_at?: string | null
          float_proposed_date?: string | null
          floated_from_date?: string | null
          guest_ready_report_url?: string | null
          id?: string
          importance_note?: string | null
          is_b2b?: boolean
          is_high_importance?: boolean | null
          job_type?: string
          late_checkout?: boolean
          late_checkout_time?: string | null
          needs_review?: boolean | null
          planned_at?: string | null
          property_id?: string | null
          reservation_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_order?: number | null
          scheduled_date: string
          scheduled_time?: string | null
          started_at?: string | null
          status?: string | null
          travel_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_scan_results?: Json | null
          ai_scan_status?: string | null
          archived_at?: string | null
          arriving_value_per_night?: number | null
          assignment_reason?: string | null
          assignment_source?: string
          cleaner_id?: string | null
          cleaner_report?: Json | null
          completed_at?: string | null
          created_at?: string | null
          custom_title?: string | null
          estimated_minutes?: number | null
          float_acknowledged_at?: string | null
          float_proposed_date?: string | null
          floated_from_date?: string | null
          guest_ready_report_url?: string | null
          id?: string
          importance_note?: string | null
          is_b2b?: boolean
          is_high_importance?: boolean | null
          job_type?: string
          late_checkout?: boolean
          late_checkout_time?: string | null
          needs_review?: boolean | null
          planned_at?: string | null
          property_id?: string | null
          reservation_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_order?: number | null
          scheduled_date?: string
          scheduled_time?: string | null
          started_at?: string | null
          status?: string | null
          travel_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_jobs_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "lane_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_logs: {
        Row: {
          cleaner_id: string | null
          context: string | null
          created_at: string
          digest: string | null
          id: string
          job_id: string | null
          message: string
          resolved_at: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          cleaner_id?: string | null
          context?: string | null
          created_at?: string
          digest?: string | null
          id?: string
          job_id?: string | null
          message: string
          resolved_at?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          cleaner_id?: string | null
          context?: string | null
          created_at?: string
          digest?: string | null
          id?: string
          job_id?: string | null
          message?: string
          resolved_at?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_logs_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_error_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_checklist_items: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_recurring: boolean | null
          item_text: string
          property_id: string
          requires_photo: boolean | null
          section: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          item_text: string
          property_id: string
          requires_photo?: boolean | null
          section: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          item_text?: string
          property_id?: string
          requires_photo?: boolean | null
          section?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_checklist_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_checklist_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_jobs: {
        Row: {
          cleaner_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          is_repeating: boolean | null
          property_id: string | null
          repeat_frequency_days: number | null
          scheduled_date: string
          scheduled_time: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          cleaner_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_repeating?: boolean | null
          property_id?: string | null
          repeat_frequency_days?: number | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          cleaner_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_repeating?: boolean | null
          property_id?: string | null
          repeat_frequency_days?: number | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_jobs_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          change_source: string | null
          created_at: string | null
          id: string
          inventory_item_id: string
          job_id: string | null
          new_condition: string | null
          new_quantity: number | null
          notes: string | null
          previous_condition: string | null
          previous_quantity: number | null
        }
        Insert: {
          change_source?: string | null
          created_at?: string | null
          id?: string
          inventory_item_id: string
          job_id?: string | null
          new_condition?: string | null
          new_quantity?: number | null
          notes?: string | null
          previous_condition?: string | null
          previous_quantity?: number | null
        }
        Update: {
          change_source?: string | null
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          job_id?: string | null
          new_condition?: string | null
          new_quantity?: number | null
          notes?: string | null
          previous_condition?: string | null
          previous_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "property_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_links: {
        Row: {
          ai_confidence: number | null
          created_at: string | null
          created_by: string | null
          id: string
          link_type: string | null
          linked_issue_id: string
          source_issue_id: string
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          link_type?: string | null
          linked_issue_id: string
          source_issue_id: string
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          link_type?: string | null
          linked_issue_id?: string
          source_issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_links_linked_issue_id_fkey"
            columns: ["linked_issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_links_linked_issue_id_fkey"
            columns: ["linked_issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_links_source_issue_id_fkey"
            columns: ["source_issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_links_source_issue_id_fkey"
            columns: ["source_issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          ai_confidence: number | null
          assignee_id: string | null
          category: string
          created_at: string | null
          description: string
          due_date: string | null
          due_type: string | null
          id: string
          job_id: string | null
          last_activity_at: string | null
          origin: string | null
          photos: Json | null
          property_id: string | null
          reservation_id: string | null
          severity: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          assignee_id?: string | null
          category: string
          created_at?: string | null
          description: string
          due_date?: string | null
          due_type?: string | null
          id?: string
          job_id?: string | null
          last_activity_at?: string | null
          origin?: string | null
          photos?: Json | null
          property_id?: string | null
          reservation_id?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          assignee_id?: string | null
          category?: string
          created_at?: string | null
          description?: string
          due_date?: string | null
          due_type?: string | null
          id?: string
          job_id?: string | null
          last_activity_at?: string | null
          origin?: string | null
          photos?: Json | null
          property_id?: string | null
          reservation_id?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "lane_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      items_to_replace: {
        Row: {
          actual_cost: number | null
          created_at: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          issue_id: string | null
          item_name: string
          key_set_id: string | null
          priority: string | null
          property_id: string
          replaced_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          issue_id?: string | null
          item_name: string
          key_set_id?: string | null
          priority?: string | null
          property_id: string
          replaced_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          issue_id?: string | null
          item_name?: string
          key_set_id?: string | null
          priority?: string | null
          property_id?: string
          replaced_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_to_replace_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_to_replace_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_to_replace_key_set_id_fkey"
            columns: ["key_set_id"]
            isOneToOne: false
            referencedRelation: "key_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_to_replace_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_to_replace_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      key_events: {
        Row: {
          actor: string | null
          created_at: string | null
          event_type: string
          id: string
          key_set_id: string | null
          notes: string | null
          photo_url: string | null
          property_id: string | null
          reservation_id: string | null
          source: string | null
          timestamp: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          key_set_id?: string | null
          notes?: string | null
          photo_url?: string | null
          property_id?: string | null
          reservation_id?: string | null
          source?: string | null
          timestamp?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          key_set_id?: string | null
          notes?: string | null
          photo_url?: string | null
          property_id?: string | null
          reservation_id?: string | null
          source?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_events_key_set_id_fkey"
            columns: ["key_set_id"]
            isOneToOne: false
            referencedRelation: "key_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "lane_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      key_return_log: {
        Row: {
          cleaner_id: string | null
          created_at: string
          id: string
          job_id: string | null
          key_set_ids: string[]
          notes: string | null
          outcome: string
          photo_url: string | null
          property_id: string
          return_date: string
        }
        Insert: {
          cleaner_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          key_set_ids?: string[]
          notes?: string | null
          outcome: string
          photo_url?: string | null
          property_id: string
          return_date: string
        }
        Update: {
          cleaner_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          key_set_ids?: string[]
          notes?: string | null
          outcome?: string
          photo_url?: string | null
          property_id?: string
          return_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_return_log_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_return_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_return_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_return_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      key_sets: {
        Row: {
          created_at: string | null
          expected_items: string[] | null
          id: string
          keynest_key_id: string | null
          label: string | null
          last_confirmed_at: string | null
          location_detail: string | null
          location_type: string | null
          property_id: string | null
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expected_items?: string[] | null
          id?: string
          keynest_key_id?: string | null
          label?: string | null
          last_confirmed_at?: string | null
          location_detail?: string | null
          location_type?: string | null
          property_id?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expected_items?: string[] | null
          id?: string
          keynest_key_id?: string | null
          label?: string | null
          last_confirmed_at?: string | null
          location_detail?: string | null
          location_type?: string | null
          property_id?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_sets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_sets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_commitments: {
        Row: {
          close_kind:
            | Database["public"]["Enums"]["lane_commitment_close_kind"]
            | null
          close_reason: string | null
          created_at: string
          draft_update: string | null
          due_at: string
          id: string
          issue_id: string | null
          kept_at: string | null
          kept_interaction_id: string | null
          loop_id: string | null
          made_at: string
          made_by: string | null
          missed_at: string | null
          owner_id: string
          prompt_answered_at: string | null
          prompt_interaction_id: string | null
          reopened_from_id: string | null
          source_interaction_id: string | null
          status: Database["public"]["Enums"]["lane_commitment_status"]
          text: string
          updated_at: string
        }
        Insert: {
          close_kind?:
            | Database["public"]["Enums"]["lane_commitment_close_kind"]
            | null
          close_reason?: string | null
          created_at?: string
          draft_update?: string | null
          due_at: string
          id?: string
          issue_id?: string | null
          kept_at?: string | null
          kept_interaction_id?: string | null
          loop_id?: string | null
          made_at?: string
          made_by?: string | null
          missed_at?: string | null
          owner_id: string
          prompt_answered_at?: string | null
          prompt_interaction_id?: string | null
          reopened_from_id?: string | null
          source_interaction_id?: string | null
          status?: Database["public"]["Enums"]["lane_commitment_status"]
          text: string
          updated_at?: string
        }
        Update: {
          close_kind?:
            | Database["public"]["Enums"]["lane_commitment_close_kind"]
            | null
          close_reason?: string | null
          created_at?: string
          draft_update?: string | null
          due_at?: string
          id?: string
          issue_id?: string | null
          kept_at?: string | null
          kept_interaction_id?: string | null
          loop_id?: string | null
          made_at?: string
          made_by?: string | null
          missed_at?: string | null
          owner_id?: string
          prompt_answered_at?: string | null
          prompt_interaction_id?: string | null
          reopened_from_id?: string | null
          source_interaction_id?: string | null
          status?: Database["public"]["Enums"]["lane_commitment_status"]
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_commitments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_kept_interaction_id_fkey"
            columns: ["kept_interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_v_loop_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_made_by_fkey"
            columns: ["made_by"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_prompt_interaction_id_fkey"
            columns: ["prompt_interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_reopened_from_id_fkey"
            columns: ["reopened_from_id"]
            isOneToOne: false
            referencedRelation: "lane_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_commitments_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_health_snapshots: {
        Row: {
          computed_at: string
          health: Database["public"]["Enums"]["lane_health"]
          id: string
          inputs: Json
          owner_id: string
          reason: string | null
        }
        Insert: {
          computed_at?: string
          health: Database["public"]["Enums"]["lane_health"]
          id?: string
          inputs?: Json
          owner_id: string
          reason?: string | null
        }
        Update: {
          computed_at?: string
          health?: Database["public"]["Enums"]["lane_health"]
          id?: string
          inputs?: Json
          owner_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lane_health_snapshots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_interactions: {
        Row: {
          ai_intent: Database["public"]["Enums"]["lane_intent"] | null
          ai_sentiment: number | null
          ai_summary: string | null
          ai_urgency: Database["public"]["Enums"]["lane_urgency"] | null
          body: string | null
          call_answered: boolean | null
          call_duration_seconds: number | null
          channel: Database["public"]["Enums"]["lane_channel"]
          churn_flag: boolean
          created_at: string
          direction: Database["public"]["Enums"]["lane_direction"]
          external_id: string | null
          id: string
          is_auto_reply: boolean
          metadata: Json
          occurred_at: string
          owner_id: string
          property_id: string | null
          recording_url: string | null
          staff_id: string | null
          subject: string | null
          thread_id: string | null
          transcript: string | null
        }
        Insert: {
          ai_intent?: Database["public"]["Enums"]["lane_intent"] | null
          ai_sentiment?: number | null
          ai_summary?: string | null
          ai_urgency?: Database["public"]["Enums"]["lane_urgency"] | null
          body?: string | null
          call_answered?: boolean | null
          call_duration_seconds?: number | null
          channel: Database["public"]["Enums"]["lane_channel"]
          churn_flag?: boolean
          created_at?: string
          direction: Database["public"]["Enums"]["lane_direction"]
          external_id?: string | null
          id?: string
          is_auto_reply?: boolean
          metadata?: Json
          occurred_at: string
          owner_id: string
          property_id?: string | null
          recording_url?: string | null
          staff_id?: string | null
          subject?: string | null
          thread_id?: string | null
          transcript?: string | null
        }
        Update: {
          ai_intent?: Database["public"]["Enums"]["lane_intent"] | null
          ai_sentiment?: number | null
          ai_summary?: string | null
          ai_urgency?: Database["public"]["Enums"]["lane_urgency"] | null
          body?: string | null
          call_answered?: boolean | null
          call_duration_seconds?: number | null
          channel?: Database["public"]["Enums"]["lane_channel"]
          churn_flag?: boolean
          created_at?: string
          direction?: Database["public"]["Enums"]["lane_direction"]
          external_id?: string | null
          id?: string
          is_auto_reply?: boolean
          metadata?: Json
          occurred_at?: string
          owner_id?: string
          property_id?: string | null
          recording_url?: string | null
          staff_id?: string | null
          subject?: string | null
          thread_id?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lane_interactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_loops: {
        Row: {
          ai_draft: string | null
          assigned_pm_id: string | null
          close_kind: Database["public"]["Enums"]["lane_close_kind"] | null
          close_reason: Database["public"]["Enums"]["lane_close_reason"] | null
          closed_at: string | null
          closed_by: string | null
          closing_interaction_id: string | null
          created_at: string
          due_at: string
          id: string
          issue_id: string | null
          notified_past_due_at: string | null
          opened_at: string
          owner_id: string
          property_id: string | null
          snooze_reason:
            | Database["public"]["Enums"]["lane_snooze_reason"]
            | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["lane_loop_status"]
          summary: string | null
          texted_not_called: boolean
          thread_id: string | null
          trigger_interaction_id: string | null
          type: Database["public"]["Enums"]["lane_loop_type"]
          updated_at: string
        }
        Insert: {
          ai_draft?: string | null
          assigned_pm_id?: string | null
          close_kind?: Database["public"]["Enums"]["lane_close_kind"] | null
          close_reason?: Database["public"]["Enums"]["lane_close_reason"] | null
          closed_at?: string | null
          closed_by?: string | null
          closing_interaction_id?: string | null
          created_at?: string
          due_at: string
          id?: string
          issue_id?: string | null
          notified_past_due_at?: string | null
          opened_at?: string
          owner_id: string
          property_id?: string | null
          snooze_reason?:
            | Database["public"]["Enums"]["lane_snooze_reason"]
            | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["lane_loop_status"]
          summary?: string | null
          texted_not_called?: boolean
          thread_id?: string | null
          trigger_interaction_id?: string | null
          type: Database["public"]["Enums"]["lane_loop_type"]
          updated_at?: string
        }
        Update: {
          ai_draft?: string | null
          assigned_pm_id?: string | null
          close_kind?: Database["public"]["Enums"]["lane_close_kind"] | null
          close_reason?: Database["public"]["Enums"]["lane_close_reason"] | null
          closed_at?: string | null
          closed_by?: string | null
          closing_interaction_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          issue_id?: string | null
          notified_past_due_at?: string | null
          opened_at?: string
          owner_id?: string
          property_id?: string | null
          snooze_reason?:
            | Database["public"]["Enums"]["lane_snooze_reason"]
            | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["lane_loop_status"]
          summary?: string | null
          texted_not_called?: boolean
          thread_id?: string | null
          trigger_interaction_id?: string | null
          type?: Database["public"]["Enums"]["lane_loop_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_loops_assigned_pm_id_fkey"
            columns: ["assigned_pm_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_closing_interaction_id_fkey"
            columns: ["closing_interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_trigger_interaction_id_fkey"
            columns: ["trigger_interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          read_at: string | null
          sent_at: string | null
          staff_id: string
          title: string
          url: string | null
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          read_at?: string | null
          sent_at?: string | null
          staff_id: string
          title: string
          url?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          sent_at?: string | null
          staff_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lane_notifications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_nps_responses: {
        Row: {
          comment: string | null
          created_at: string
          external_id: string | null
          id: string
          interaction_id: string | null
          kind: Database["public"]["Enums"]["lane_nps_kind"]
          loop_id: string | null
          owner_id: string
          responded_at: string
          score: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          interaction_id?: string | null
          kind: Database["public"]["Enums"]["lane_nps_kind"]
          loop_id?: string | null
          owner_id: string
          responded_at?: string
          score: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          interaction_id?: string | null
          kind?: Database["public"]["Enums"]["lane_nps_kind"]
          loop_id?: string | null
          owner_id?: string
          responded_at?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "lane_nps_responses_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_nps_responses_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_nps_responses_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_v_loop_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_nps_responses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_outreach_tasks: {
        Row: {
          assigned_pm_id: string | null
          created_at: string
          done_at: string | null
          done_interaction_id: string | null
          due_at: string
          id: string
          owner_id: string
          property_id: string | null
          source: Database["public"]["Enums"]["lane_outreach_source"]
          status: Database["public"]["Enums"]["lane_outreach_status"]
          talking_point: string
        }
        Insert: {
          assigned_pm_id?: string | null
          created_at?: string
          done_at?: string | null
          done_interaction_id?: string | null
          due_at: string
          id?: string
          owner_id: string
          property_id?: string | null
          source: Database["public"]["Enums"]["lane_outreach_source"]
          status?: Database["public"]["Enums"]["lane_outreach_status"]
          talking_point: string
        }
        Update: {
          assigned_pm_id?: string | null
          created_at?: string
          done_at?: string | null
          done_interaction_id?: string | null
          due_at?: string
          id?: string
          owner_id?: string
          property_id?: string | null
          source?: Database["public"]["Enums"]["lane_outreach_source"]
          status?: Database["public"]["Enums"]["lane_outreach_status"]
          talking_point?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_outreach_tasks_assigned_pm_id_fkey"
            columns: ["assigned_pm_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_outreach_tasks_done_interaction_id_fkey"
            columns: ["done_interaction_id"]
            isOneToOne: false
            referencedRelation: "lane_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_outreach_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_outreach_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_outreach_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_owner_contact_points: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["lane_contact_method"]
          owner_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind: Database["public"]["Enums"]["lane_contact_method"]
          owner_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["lane_contact_method"]
          owner_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_owner_contact_points_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_owner_properties: {
        Row: {
          created_at: string
          owner_id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          property_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_owner_properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_owner_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_owner_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_owners: {
        Row: {
          assigned_pm_id: string | null
          cadence_days: number
          created_at: string
          expected_occupancy: number | null
          health: Database["public"]["Enums"]["lane_health"]
          health_reason: string | null
          health_updated_at: string | null
          hubspot_contact_id: string | null
          id: string
          is_active: boolean
          last_contact_at: string | null
          last_outbound_at: string | null
          name: string
          notes: string | null
          onboarded_at: string | null
          preferred_contact: Database["public"]["Enums"]["lane_contact_method"]
          primary_email: string | null
          primary_phone: string | null
          updated_at: string
        }
        Insert: {
          assigned_pm_id?: string | null
          cadence_days?: number
          created_at?: string
          expected_occupancy?: number | null
          health?: Database["public"]["Enums"]["lane_health"]
          health_reason?: string | null
          health_updated_at?: string | null
          hubspot_contact_id?: string | null
          id?: string
          is_active?: boolean
          last_contact_at?: string | null
          last_outbound_at?: string | null
          name: string
          notes?: string | null
          onboarded_at?: string | null
          preferred_contact?: Database["public"]["Enums"]["lane_contact_method"]
          primary_email?: string | null
          primary_phone?: string | null
          updated_at?: string
        }
        Update: {
          assigned_pm_id?: string | null
          cadence_days?: number
          created_at?: string
          expected_occupancy?: number | null
          health?: Database["public"]["Enums"]["lane_health"]
          health_reason?: string | null
          health_updated_at?: string | null
          hubspot_contact_id?: string | null
          id?: string
          is_active?: boolean
          last_contact_at?: string | null
          last_outbound_at?: string | null
          name?: string
          notes?: string | null
          onboarded_at?: string | null
          preferred_contact?: Database["public"]["Enums"]["lane_contact_method"]
          primary_email?: string | null
          primary_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_owners_assigned_pm_id_fkey"
            columns: ["assigned_pm_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_property_reviews: {
        Row: {
          body: string | null
          channel: string | null
          created_at: string
          external_id: string | null
          id: string
          loop_id: string | null
          property_id: string
          rating: number
          reviewed_at: string
          title: string | null
        }
        Insert: {
          body?: string | null
          channel?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          loop_id?: string | null
          property_id: string
          rating: number
          reviewed_at: string
          title?: string | null
        }
        Update: {
          body?: string | null
          channel?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          loop_id?: string | null
          property_id?: string
          rating?: number
          reviewed_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lane_property_reviews_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_property_reviews_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_v_loop_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_property_reviews_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_property_reviews_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_property_snapshots: {
        Row: {
          bookings_next_30: number | null
          forecast_next_30: number | null
          occupancy_month: number | null
          occupancy_month_last_year: number | null
          occupancy_next_30: number | null
          property_id: string
          revenue_month: number | null
          snapshot_date: string
          status: string | null
        }
        Insert: {
          bookings_next_30?: number | null
          forecast_next_30?: number | null
          occupancy_month?: number | null
          occupancy_month_last_year?: number | null
          occupancy_next_30?: number | null
          property_id: string
          revenue_month?: number | null
          snapshot_date: string
          status?: string | null
        }
        Update: {
          bookings_next_30?: number | null
          forecast_next_30?: number | null
          occupancy_month?: number | null
          occupancy_month_last_year?: number | null
          occupancy_next_30?: number | null
          property_id?: string
          revenue_month?: number | null
          snapshot_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lane_property_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_property_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          staff_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          staff_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_push_subscriptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_resly_events: {
        Row: {
          dedupe_key: string
          detected_at: string
          id: string
          kind: Database["public"]["Enums"]["lane_outreach_source"]
          loop_id: string | null
          outreach_task_id: string | null
          payload: Json
          property_id: string
        }
        Insert: {
          dedupe_key: string
          detected_at?: string
          id?: string
          kind: Database["public"]["Enums"]["lane_outreach_source"]
          loop_id?: string | null
          outreach_task_id?: string | null
          payload?: Json
          property_id: string
        }
        Update: {
          dedupe_key?: string
          detected_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["lane_outreach_source"]
          loop_id?: string | null
          outreach_task_id?: string | null
          payload?: Json
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_resly_events_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_resly_events_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "lane_v_loop_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_resly_events_outreach_task_id_fkey"
            columns: ["outreach_task_id"]
            isOneToOne: false
            referencedRelation: "lane_outreach_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_resly_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_resly_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_staff: {
        Row: {
          created_at: string
          dialpad_user_id: string | null
          email: string
          gmail_refresh_token: string | null
          id: string
          is_active: boolean
          name: string
          role: Database["public"]["Enums"]["lane_staff_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dialpad_user_id?: string | null
          email: string
          gmail_refresh_token?: string | null
          id: string
          is_active?: boolean
          name: string
          role?: Database["public"]["Enums"]["lane_staff_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dialpad_user_id?: string | null
          email?: string
          gmail_refresh_token?: string | null
          id?: string
          is_active?: boolean
          name?: string
          role?: Database["public"]["Enums"]["lane_staff_role"]
          updated_at?: string
        }
        Relationships: []
      }
      lane_staff_invites: {
        Row: {
          created_at: string
          dialpad_user_id: string | null
          email: string
          name: string
          role: Database["public"]["Enums"]["lane_staff_role"]
        }
        Insert: {
          created_at?: string
          dialpad_user_id?: string | null
          email: string
          name: string
          role?: Database["public"]["Enums"]["lane_staff_role"]
        }
        Update: {
          created_at?: string
          dialpad_user_id?: string | null
          email?: string
          name?: string
          role?: Database["public"]["Enums"]["lane_staff_role"]
        }
        Relationships: []
      }
      lane_sync_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      manager_tasks: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          issue_id: string | null
          priority: string | null
          property_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          issue_id?: string | null
          priority?: string | null
          property_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          issue_id?: string | null
          priority?: string | null
          property_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_tasks_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_setup_cleans: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          matched_property_id: string | null
          notes: string | null
          property_text: string
          resolved_at: string | null
          scheduled_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          matched_property_id?: string | null
          notes?: string | null
          property_text: string
          resolved_at?: string | null
          scheduled_date: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          matched_property_id?: string | null
          notes?: string | null
          property_text?: string
          resolved_at?: string | null
          scheduled_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_setup_cleans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_setup_cleans_matched_property_id_fkey"
            columns: ["matched_property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_setup_cleans_matched_property_id_fkey"
            columns: ["matched_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_messages: {
        Row: {
          error: string | null
          finding_ids: Json | null
          findings_count: number | null
          guest_name: string | null
          id: string
          processed_at: string | null
          property_id: string | null
          reservation_id: string | null
          resly_conversation_id: string
          resly_message_id: string
        }
        Insert: {
          error?: string | null
          finding_ids?: Json | null
          findings_count?: number | null
          guest_name?: string | null
          id?: string
          processed_at?: string | null
          property_id?: string | null
          reservation_id?: string | null
          resly_conversation_id: string
          resly_message_id: string
        }
        Update: {
          error?: string | null
          finding_ids?: Json | null
          findings_count?: number | null
          guest_name?: string | null
          id?: string
          processed_at?: string | null
          property_id?: string | null
          reservation_id?: string | null
          resly_conversation_id?: string
          resly_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_messages_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "lane_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_messages_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          amenities: Json | null
          backup_cleaner_id: string | null
          baseline_photos: Json | null
          bathrooms: number | null
          bedrooms: number | null
          building_id: string | null
          building_name: string | null
          city: string | null
          clean_duration_minutes: number | null
          cleaning_company: string | null
          created_at: string | null
          geocode_error: string | null
          geocoded_at: string | null
          has_coffee_machine: boolean
          id: string
          is_active: boolean | null
          key_access_type: string | null
          key_config: Json | null
          key_notes: string | null
          key_number: number | null
          key_sheet: Json | null
          latitude: number | null
          longitude: number | null
          management_type: string | null
          missing_amenities: string[] | null
          name: string
          notes: string | null
          owner_stay_skip_clean_after: boolean | null
          owner_stay_skip_clean_before: boolean | null
          post_code: string | null
          preferred_cleaner_id: string | null
          region: string | null
          resly_default_cleaner: string | null
          resly_listing_id: string | null
          resly_raw: Json | null
          resly_room_id: string | null
          resly_room_type_id: string | null
          rules: Json | null
          source: string | null
          state: string | null
          suburb: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          amenities?: Json | null
          backup_cleaner_id?: string | null
          baseline_photos?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string | null
          building_name?: string | null
          city?: string | null
          clean_duration_minutes?: number | null
          cleaning_company?: string | null
          created_at?: string | null
          geocode_error?: string | null
          geocoded_at?: string | null
          has_coffee_machine?: boolean
          id?: string
          is_active?: boolean | null
          key_access_type?: string | null
          key_config?: Json | null
          key_notes?: string | null
          key_number?: number | null
          key_sheet?: Json | null
          latitude?: number | null
          longitude?: number | null
          management_type?: string | null
          missing_amenities?: string[] | null
          name: string
          notes?: string | null
          owner_stay_skip_clean_after?: boolean | null
          owner_stay_skip_clean_before?: boolean | null
          post_code?: string | null
          preferred_cleaner_id?: string | null
          region?: string | null
          resly_default_cleaner?: string | null
          resly_listing_id?: string | null
          resly_raw?: Json | null
          resly_room_id?: string | null
          resly_room_type_id?: string | null
          rules?: Json | null
          source?: string | null
          state?: string | null
          suburb?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          amenities?: Json | null
          backup_cleaner_id?: string | null
          baseline_photos?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string | null
          building_name?: string | null
          city?: string | null
          clean_duration_minutes?: number | null
          cleaning_company?: string | null
          created_at?: string | null
          geocode_error?: string | null
          geocoded_at?: string | null
          has_coffee_machine?: boolean
          id?: string
          is_active?: boolean | null
          key_access_type?: string | null
          key_config?: Json | null
          key_notes?: string | null
          key_number?: number | null
          key_sheet?: Json | null
          latitude?: number | null
          longitude?: number | null
          management_type?: string | null
          missing_amenities?: string[] | null
          name?: string
          notes?: string | null
          owner_stay_skip_clean_after?: boolean | null
          owner_stay_skip_clean_before?: boolean | null
          post_code?: string | null
          preferred_cleaner_id?: string | null
          region?: string | null
          resly_default_cleaner?: string | null
          resly_listing_id?: string | null
          resly_raw?: Json | null
          resly_room_id?: string | null
          resly_room_type_id?: string | null
          rules?: Json | null
          source?: string | null
          state?: string | null
          suburb?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_backup_cleaner_id_fkey"
            columns: ["backup_cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_preferred_cleaner_id_fkey"
            columns: ["preferred_cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
        ]
      }
      property_inventory: {
        Row: {
          category: string
          condition: string | null
          created_at: string | null
          current_quantity: number | null
          expected_quantity: number | null
          id: string
          is_active: boolean | null
          item_name: string
          last_verified_at: string | null
          last_verified_by: string | null
          location_note: string | null
          needs_replacement: boolean | null
          notes: string | null
          property_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          condition?: string | null
          created_at?: string | null
          current_quantity?: number | null
          expected_quantity?: number | null
          id?: string
          is_active?: boolean | null
          item_name: string
          last_verified_at?: string | null
          last_verified_by?: string | null
          location_note?: string | null
          needs_replacement?: boolean | null
          notes?: string | null
          property_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          condition?: string | null
          created_at?: string | null
          current_quantity?: number | null
          expected_quantity?: number | null
          id?: string
          is_active?: boolean | null
          item_name?: string
          last_verified_at?: string | null
          last_verified_by?: string | null
          location_note?: string | null
          needs_replacement?: boolean | null
          notes?: string | null
          property_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_inventory_last_verified_by_fkey"
            columns: ["last_verified_by"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inventory_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inventory_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_recommendations: {
        Row: {
          ai_confidence: number | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          issue_id: string | null
          priority: string | null
          property_id: string
          source: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          issue_id?: string | null
          priority?: string | null
          property_id: string
          source?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          issue_id?: string | null
          priority?: string | null
          property_id?: string
          source?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_recommendations_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_recommendations_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "lane_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_recommendations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_recommendations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_task_tracking: {
        Row: {
          created_at: string | null
          id: string
          last_completed_at: string | null
          next_due_job_id: string | null
          property_id: string | null
          stays_since_last: number | null
          task_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_completed_at?: string | null
          next_due_job_id?: string | null
          property_id?: string | null
          stays_since_last?: number | null
          task_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_completed_at?: string | null
          next_due_job_id?: string | null
          property_id?: string | null
          stays_since_last?: number | null
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_task_tracking_next_due_job_id_fkey"
            columns: ["next_due_job_id"]
            isOneToOne: false
            referencedRelation: "cleaning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_tracking_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_tracking_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_exclusions: {
        Row: {
          check_out: string | null
          detail: string | null
          detected_at: string | null
          guest_name: string | null
          id: string
          property_id: string | null
          property_name: string | null
          reason: string
          reservation_id: string | null
        }
        Insert: {
          check_out?: string | null
          detail?: string | null
          detected_at?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          property_name?: string | null
          reason: string
          reservation_id?: string | null
        }
        Update: {
          check_out?: string | null
          detail?: string | null
          detected_at?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          property_name?: string | null
          reason?: string
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_exclusions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_exclusions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_exclusions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "lane_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_exclusions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          accommodation_value: number | null
          adults: number | null
          agent_id: string | null
          agent_name: string | null
          balance: number | null
          channel: string | null
          check_in: string
          check_out: string
          children: number | null
          comments: string | null
          created_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          is_owner_stay: boolean | null
          property_id: string | null
          resly_raw: Json | null
          resly_reservation_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accommodation_value?: number | null
          adults?: number | null
          agent_id?: string | null
          agent_name?: string | null
          balance?: number | null
          channel?: string | null
          check_in: string
          check_out: string
          children?: number | null
          comments?: string | null
          created_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_owner_stay?: boolean | null
          property_id?: string | null
          resly_raw?: Json | null
          resly_reservation_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accommodation_value?: number | null
          adults?: number | null
          agent_id?: string | null
          agent_name?: string | null
          balance?: number | null
          channel?: string | null
          check_in?: string
          check_out?: string
          children?: number | null
          comments?: string | null
          created_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_owner_stay?: boolean | null
          property_id?: string | null
          resly_raw?: Json | null
          resly_reservation_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      whelm_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      whelm_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      lane_issues: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          due_type: string | null
          id: string | null
          last_activity_at: string | null
          origin: string | null
          property_id: string | null
          severity: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          due_type?: string | null
          id?: string | null
          last_activity_at?: string | null
          origin?: string | null
          property_id?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          due_type?: string | null
          id?: string | null
          last_activity_at?: string | null
          origin?: string | null
          property_id?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_properties: {
        Row: {
          address: string | null
          bathrooms: number | null
          bedrooms: number | null
          building_id: string | null
          building_name: string | null
          city: string | null
          cleaning_company: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          key_access_type: string | null
          key_number: number | null
          management_type: string | null
          name: string | null
          post_code: string | null
          region: string | null
          resly_listing_id: string | null
          resly_room_id: string | null
          state: string | null
          suburb: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string | null
          building_name?: string | null
          city?: string | null
          cleaning_company?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          key_access_type?: string | null
          key_number?: number | null
          management_type?: string | null
          name?: string | null
          post_code?: string | null
          region?: string | null
          resly_listing_id?: string | null
          resly_room_id?: string | null
          state?: string | null
          suburb?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string | null
          building_name?: string | null
          city?: string | null
          cleaning_company?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          key_access_type?: string | null
          key_number?: number | null
          management_type?: string | null
          name?: string | null
          post_code?: string | null
          region?: string | null
          resly_listing_id?: string | null
          resly_room_id?: string | null
          state?: string | null
          suburb?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_reservations: {
        Row: {
          accommodation_value: number | null
          channel: string | null
          check_in: string | null
          check_out: string | null
          created_at: string | null
          id: string | null
          is_owner_stay: boolean | null
          property_id: string | null
          resly_reservation_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accommodation_value?: number | null
          channel?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          id?: string | null
          is_owner_stay?: boolean | null
          property_id?: string | null
          resly_reservation_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accommodation_value?: number | null
          channel?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          id?: string | null
          is_owner_stay?: boolean | null
          property_id?: string | null
          resly_reservation_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "lane_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_v_loop_stats: {
        Row: {
          assigned_pm_id: string | null
          close_kind: Database["public"]["Enums"]["lane_close_kind"] | null
          closed_at: string | null
          due_at: string | null
          id: string | null
          open_over_48h: boolean | null
          opened_at: string | null
          owner_id: string | null
          response_minutes: number | null
          status: Database["public"]["Enums"]["lane_loop_status"] | null
          texted_not_called: boolean | null
          type: Database["public"]["Enums"]["lane_loop_type"] | null
          within_sla: boolean | null
        }
        Insert: {
          assigned_pm_id?: string | null
          close_kind?: Database["public"]["Enums"]["lane_close_kind"] | null
          closed_at?: string | null
          due_at?: string | null
          id?: string | null
          open_over_48h?: never
          opened_at?: string | null
          owner_id?: string | null
          response_minutes?: never
          status?: Database["public"]["Enums"]["lane_loop_status"] | null
          texted_not_called?: boolean | null
          type?: Database["public"]["Enums"]["lane_loop_type"] | null
          within_sla?: never
        }
        Update: {
          assigned_pm_id?: string | null
          close_kind?: Database["public"]["Enums"]["lane_close_kind"] | null
          closed_at?: string | null
          due_at?: string | null
          id?: string | null
          open_over_48h?: never
          opened_at?: string | null
          owner_id?: string | null
          response_minutes?: never
          status?: Database["public"]["Enums"]["lane_loop_status"] | null
          texted_not_called?: boolean | null
          type?: Database["public"]["Enums"]["lane_loop_type"] | null
          within_sla?: never
        }
        Relationships: [
          {
            foreignKeyName: "lane_loops_assigned_pm_id_fkey"
            columns: ["assigned_pm_id"]
            isOneToOne: false
            referencedRelation: "lane_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_loops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "lane_owners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      lane_add_business_minutes: {
        Args: { minutes: number; ts: string }
        Returns: string
      }
      lane_business_minutes_between: {
        Args: { a: string; b: string }
        Returns: number
      }
      lane_end_of_business_day: { Args: { ts: string }; Returns: string }
      lane_is_staff: { Args: never; Returns: boolean }
      lane_next_business_start: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      lane_channel:
        | "email"
        | "call"
        | "sms"
        | "maintenance"
        | "nps"
        | "note"
        | "commitment"
        | "resly"
      lane_close_kind: "evidence" | "manual"
      lane_close_reason:
        | "resolved_elsewhere"
        | "no_reply_needed"
        | "duplicate"
        | "owner_withdrew"
      lane_commitment_close_kind: "evidence" | "confirmed" | "manual"
      lane_commitment_status: "suggested" | "open" | "kept" | "missed"
      lane_contact_method: "call" | "email" | "sms"
      lane_direction: "inbound" | "outbound" | "internal"
      lane_health: "green" | "amber" | "red"
      lane_intent:
        | "payout"
        | "maintenance"
        | "complaint"
        | "general"
        | "churn_risk"
        | "booking"
      lane_loop_status: "open" | "closed"
      lane_loop_type:
        | "email"
        | "missed_call"
        | "sms"
        | "maintenance"
        | "detractor"
        | "resly"
      lane_nps_kind: "quarterly" | "onboarding" | "maintenance_closed"
      lane_outreach_source:
        | "cadence"
        | "occupancy"
        | "review"
        | "cancellation"
        | "status_change"
      lane_outreach_status: "open" | "done" | "skipped"
      lane_snooze_reason:
        | "waiting_on_owner"
        | "waiting_on_trade"
        | "owner_asked_later"
        | "after_hours"
      lane_staff_role: "pm" | "gm" | "director"
      lane_urgency: "low" | "normal" | "high"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lane_channel: [
        "email",
        "call",
        "sms",
        "maintenance",
        "nps",
        "note",
        "commitment",
        "resly",
      ],
      lane_close_kind: ["evidence", "manual"],
      lane_close_reason: [
        "resolved_elsewhere",
        "no_reply_needed",
        "duplicate",
        "owner_withdrew",
      ],
      lane_commitment_close_kind: ["evidence", "confirmed", "manual"],
      lane_commitment_status: ["suggested", "open", "kept", "missed"],
      lane_contact_method: ["call", "email", "sms"],
      lane_direction: ["inbound", "outbound", "internal"],
      lane_health: ["green", "amber", "red"],
      lane_intent: [
        "payout",
        "maintenance",
        "complaint",
        "general",
        "churn_risk",
        "booking",
      ],
      lane_loop_status: ["open", "closed"],
      lane_loop_type: [
        "email",
        "missed_call",
        "sms",
        "maintenance",
        "detractor",
        "resly",
      ],
      lane_nps_kind: ["quarterly", "onboarding", "maintenance_closed"],
      lane_outreach_source: [
        "cadence",
        "occupancy",
        "review",
        "cancellation",
        "status_change",
      ],
      lane_outreach_status: ["open", "done", "skipped"],
      lane_snooze_reason: [
        "waiting_on_owner",
        "waiting_on_trade",
        "owner_asked_later",
        "after_hours",
      ],
      lane_staff_role: ["pm", "gm", "director"],
      lane_urgency: ["low", "normal", "high"],
    },
  },
} as const
