// Generated from the live Supabase schema. DO NOT EDIT BY HAND.
//
// Regenerate after any migration:  npm run db:types
//
// Replaces the permissive placeholder that typed every table as
// Record<string, any>. Queries are now checked against the real schema.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: string;
          batch_id: string | null;
          body: string;
          course_id: string | null;
          created_by: string | null;
          id: string;
          published_at: string;
          title: string;
        };
        Insert: {
          audience?: string;
          batch_id?: string | null;
          body: string;
          course_id?: string | null;
          created_by?: string | null;
          id?: string;
          published_at?: string;
          title: string;
        };
        Update: {
          audience?: string;
          batch_id?: string | null;
          body?: string;
          course_id?: string | null;
          created_by?: string | null;
          id?: string;
          published_at?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'announcements_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'announcements_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'announcements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          category: string;
          default_value: Json;
          description: string;
          is_protected: boolean;
          is_secret: boolean;
          key: string;
          name: string;
          unit: string | null;
          updated_at: string;
          updated_by: string | null;
          validation: Json;
          value: Json;
          value_type: Database['public']['Enums']['setting_type'];
        };
        Insert: {
          category: string;
          default_value: Json;
          description: string;
          is_protected?: boolean;
          is_secret?: boolean;
          key: string;
          name: string;
          unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          validation?: Json;
          value: Json;
          value_type: Database['public']['Enums']['setting_type'];
        };
        Update: {
          category?: string;
          default_value?: Json;
          description?: string;
          is_protected?: boolean;
          is_secret?: boolean;
          key?: string;
          name?: string;
          unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          validation?: Json;
          value?: Json;
          value_type?: Database['public']['Enums']['setting_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'app_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: number;
          ip: unknown;
          request_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: number;
          ip?: unknown;
          request_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: number;
          ip?: unknown;
          request_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      batches: {
        Row: {
          capacity: number | null;
          course_id: string;
          ends_on: string | null;
          id: string;
          is_active: boolean;
          name: string;
          starts_on: string | null;
        };
        Insert: {
          capacity?: number | null;
          course_id: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          starts_on?: string | null;
        };
        Update: {
          capacity?: number | null;
          course_id?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          starts_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'batches_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
        ];
      };
      class_schedules: {
        Row: {
          auto_generate: boolean;
          batch_id: string | null;
          course_id: string;
          created_at: string;
          default_join_url: string | null;
          description: string | null;
          duration_min: number;
          educator_id: string;
          ends_on: string | null;
          id: string;
          is_active: boolean;
          start_time: string;
          starts_on: string;
          timezone: string;
          title: string;
          weekdays: number[];
        };
        Insert: {
          auto_generate?: boolean;
          batch_id?: string | null;
          course_id: string;
          created_at?: string;
          default_join_url?: string | null;
          description?: string | null;
          duration_min: number;
          educator_id: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          start_time: string;
          starts_on: string;
          timezone?: string;
          title: string;
          weekdays: number[];
        };
        Update: {
          auto_generate?: boolean;
          batch_id?: string | null;
          course_id?: string;
          created_at?: string;
          default_join_url?: string | null;
          description?: string | null;
          duration_min?: number;
          educator_id?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          start_time?: string;
          starts_on?: string;
          timezone?: string;
          title?: string;
          weekdays?: number[];
        };
        Relationships: [
          {
            foreignKeyName: 'class_schedules_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_schedules_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_schedules_educator_id_fkey';
            columns: ['educator_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      config_history: {
        Row: {
          actor_email: string | null;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity: string;
          entity_key: string;
          id: number;
          reason: string | null;
        };
        Insert: {
          actor_email?: string | null;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity: string;
          entity_key: string;
          id?: number;
          reason?: string | null;
        };
        Update: {
          actor_email?: string | null;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity?: string;
          entity_key?: string;
          id?: number;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'config_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      config_version: {
        Row: {
          singleton: boolean;
          updated_at: string;
          version: number;
        };
        Insert: {
          singleton?: boolean;
          updated_at?: string;
          version?: number;
        };
        Update: {
          singleton?: boolean;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          kind: string;
          max_discount_inr: number | null;
          max_uses: number | null;
          min_amount_inr: number;
          per_user_limit: number;
          used_count: number;
          valid_from: string;
          valid_to: string | null;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          kind: string;
          max_discount_inr?: number | null;
          max_uses?: number | null;
          min_amount_inr?: number;
          per_user_limit?: number;
          used_count?: number;
          valid_from?: string;
          valid_to?: string | null;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          max_discount_inr?: number | null;
          max_uses?: number | null;
          min_amount_inr?: number;
          per_user_limit?: number;
          used_count?: number;
          valid_from?: string;
          valid_to?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'coupons_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      course_modules: {
        Row: {
          course_id: string;
          id: string;
          position: number;
          title: string;
        };
        Insert: {
          course_id: string;
          id?: string;
          position: number;
          title: string;
        };
        Update: {
          course_id?: string;
          id?: string;
          position?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_modules_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
        ];
      };
      courses: {
        Row: {
          access_days: number | null;
          approved_at: string | null;
          approved_by: string | null;
          banner_public_id: string | null;
          category: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_free: boolean | null;
          mrp_inr: number | null;
          preview_drive_id: string | null;
          price_inr: number;
          published_at: string | null;
          rating_avg: number | null;
          slug: string;
          status: Database['public']['Enums']['course_status'];
          student_count: number;
          subtitle: string | null;
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          access_days?: number | null;
          approved_at?: string | null;
          approved_by?: string | null;
          banner_public_id?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_free?: boolean | null;
          mrp_inr?: number | null;
          preview_drive_id?: string | null;
          price_inr?: number;
          published_at?: string | null;
          rating_avg?: number | null;
          slug: string;
          status?: Database['public']['Enums']['course_status'];
          student_count?: number;
          subtitle?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          access_days?: number | null;
          approved_at?: string | null;
          approved_by?: string | null;
          banner_public_id?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_free?: boolean | null;
          mrp_inr?: number | null;
          preview_drive_id?: string | null;
          price_inr?: number;
          published_at?: string | null;
          rating_avg?: number | null;
          slug?: string;
          status?: Database['public']['Enums']['course_status'];
          student_count?: number;
          subtitle?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'courses_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'courses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      doubt_answers: {
        Row: {
          attachments: Json;
          body: string;
          created_at: string;
          doubt_id: string;
          id: string;
          is_accepted: boolean;
          is_educator_verified: boolean;
          upvotes: number;
          user_id: string;
        };
        Insert: {
          attachments?: Json;
          body: string;
          created_at?: string;
          doubt_id: string;
          id?: string;
          is_accepted?: boolean;
          is_educator_verified?: boolean;
          upvotes?: number;
          user_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          created_at?: string;
          doubt_id?: string;
          id?: string;
          is_accepted?: boolean;
          is_educator_verified?: boolean;
          upvotes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'doubt_answers_doubt_id_fkey';
            columns: ['doubt_id'];
            isOneToOne: false;
            referencedRelation: 'doubts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'doubt_answers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      doubt_votes: {
        Row: {
          doubt_id: string;
          user_id: string;
        };
        Insert: {
          doubt_id: string;
          user_id: string;
        };
        Update: {
          doubt_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'doubt_votes_doubt_id_fkey';
            columns: ['doubt_id'];
            isOneToOne: false;
            referencedRelation: 'doubts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'doubt_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      doubts: {
        Row: {
          answered_at: string | null;
          attachments: Json;
          body: string;
          course_id: string | null;
          created_at: string;
          id: string;
          is_anonymous: boolean;
          search_tsv: unknown;
          status: Database['public']['Enums']['doubt_status'];
          subject: string | null;
          title: string | null;
          upvotes: number;
          user_id: string;
        };
        Insert: {
          answered_at?: string | null;
          attachments?: Json;
          body: string;
          course_id?: string | null;
          created_at?: string;
          id?: string;
          is_anonymous?: boolean;
          search_tsv?: unknown;
          status?: Database['public']['Enums']['doubt_status'];
          subject?: string | null;
          title?: string | null;
          upvotes?: number;
          user_id: string;
        };
        Update: {
          answered_at?: string | null;
          attachments?: Json;
          body?: string;
          course_id?: string | null;
          created_at?: string;
          id?: string;
          is_anonymous?: boolean;
          search_tsv?: unknown;
          status?: Database['public']['Enums']['doubt_status'];
          subject?: string | null;
          title?: string | null;
          upvotes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'doubts_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'doubts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      drive_file_mirrors: {
        Row: {
          account_label: string | null;
          created_at: string;
          drive_file_id: string;
          id: string;
          is_active: boolean;
          lesson_id: string | null;
        };
        Insert: {
          account_label?: string | null;
          created_at?: string;
          drive_file_id: string;
          id?: string;
          is_active?: boolean;
          lesson_id?: string | null;
        };
        Update: {
          account_label?: string | null;
          created_at?: string;
          drive_file_id?: string;
          id?: string;
          is_active?: boolean;
          lesson_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'drive_file_mirrors_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
        ];
      };
      email_events: {
        Row: {
          email_log_id: string | null;
          event_type: Database['public']['Enums']['email_event_type'];
          id: number;
          occurred_at: string;
          payload: Json;
          received_at: string;
          recipient: string | null;
          resend_id: string | null;
          svix_id: string | null;
        };
        Insert: {
          email_log_id?: string | null;
          event_type: Database['public']['Enums']['email_event_type'];
          id?: number;
          occurred_at: string;
          payload: Json;
          received_at?: string;
          recipient?: string | null;
          resend_id?: string | null;
          svix_id?: string | null;
        };
        Update: {
          email_log_id?: string | null;
          event_type?: Database['public']['Enums']['email_event_type'];
          id?: number;
          occurred_at?: string;
          payload?: Json;
          received_at?: string;
          recipient?: string | null;
          resend_id?: string | null;
          svix_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_events_email_log_id_fkey';
            columns: ['email_log_id'];
            isOneToOne: false;
            referencedRelation: 'email_log';
            referencedColumns: ['id'];
          },
        ];
      };
      email_log: {
        Row: {
          bounce_type: string | null;
          bounced_at: string | null;
          category: string | null;
          click_count: number;
          clicked_at: string | null;
          complained_at: string | null;
          created_at: string;
          delivered_at: string | null;
          error: string | null;
          id: string;
          idempotency_key: string | null;
          last_event_at: string | null;
          open_count: number;
          opened_at: string | null;
          resend_id: string | null;
          sent_at: string | null;
          state: Database['public']['Enums']['email_status'];
          status: string;
          subject: string | null;
          template: string;
          to_email: string;
          user_id: string | null;
        };
        Insert: {
          bounce_type?: string | null;
          bounced_at?: string | null;
          category?: string | null;
          click_count?: number;
          clicked_at?: string | null;
          complained_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error?: string | null;
          id?: string;
          idempotency_key?: string | null;
          last_event_at?: string | null;
          open_count?: number;
          opened_at?: string | null;
          resend_id?: string | null;
          sent_at?: string | null;
          state?: Database['public']['Enums']['email_status'];
          status?: string;
          subject?: string | null;
          template: string;
          to_email: string;
          user_id?: string | null;
        };
        Update: {
          bounce_type?: string | null;
          bounced_at?: string | null;
          category?: string | null;
          click_count?: number;
          clicked_at?: string | null;
          complained_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error?: string | null;
          id?: string;
          idempotency_key?: string | null;
          last_event_at?: string | null;
          open_count?: number;
          opened_at?: string | null;
          resend_id?: string | null;
          sent_at?: string | null;
          state?: Database['public']['Enums']['email_status'];
          status?: string;
          subject?: string | null;
          template?: string;
          to_email?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      email_suppressions: {
        Row: {
          detail: string | null;
          email: string;
          reason: string;
          released_at: string | null;
          released_by: string | null;
          suppressed_at: string;
        };
        Insert: {
          detail?: string | null;
          email: string;
          reason: string;
          released_at?: string | null;
          released_by?: string | null;
          suppressed_at?: string;
        };
        Update: {
          detail?: string | null;
          email?: string;
          reason?: string;
          released_at?: string | null;
          released_by?: string | null;
          suppressed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_suppressions_released_by_fkey';
            columns: ['released_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      enrollments: {
        Row: {
          batch_id: string | null;
          course_id: string;
          expires_at: string | null;
          granted_at: string;
          id: string;
          order_id: string | null;
          status: Database['public']['Enums']['enrollment_state'];
          user_id: string;
        };
        Insert: {
          batch_id?: string | null;
          course_id: string;
          expires_at?: string | null;
          granted_at?: string;
          id?: string;
          order_id?: string | null;
          status?: Database['public']['Enums']['enrollment_state'];
          user_id: string;
        };
        Update: {
          batch_id?: string | null;
          course_id?: string;
          expires_at?: string | null;
          granted_at?: string;
          id?: string;
          order_id?: string | null;
          status?: Database['public']['Enums']['enrollment_state'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'enrollments_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      feature_flags: {
        Row: {
          category: string;
          default_enabled: boolean;
          description: string;
          enabled: boolean;
          is_kill_switch: boolean;
          is_protected: boolean;
          key: string;
          name: string;
          revert_at: string | null;
          rollout_percent: number;
          target_roles: Database['public']['Enums']['app_role'][] | null;
          target_user_ids: string[] | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category: string;
          default_enabled?: boolean;
          description: string;
          enabled?: boolean;
          is_kill_switch?: boolean;
          is_protected?: boolean;
          key: string;
          name: string;
          revert_at?: string | null;
          rollout_percent?: number;
          target_roles?: Database['public']['Enums']['app_role'][] | null;
          target_user_ids?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          default_enabled?: boolean;
          description?: string;
          enabled?: boolean;
          is_kill_switch?: boolean;
          is_protected?: boolean;
          key?: string;
          name?: string;
          revert_at?: string | null;
          rollout_percent?: number;
          target_roles?: Database['public']['Enums']['app_role'][] | null;
          target_user_ids?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'feature_flags_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      lesson_progress: {
        Row: {
          completed_at: string | null;
          course_id: string;
          lesson_id: string;
          opened_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          course_id: string;
          lesson_id: string;
          opened_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          course_id?: string;
          lesson_id?: string;
          opened_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lesson_progress_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_progress_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      lessons: {
        Row: {
          banner_public_id: string | null;
          course_id: string;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          drive_file_id: string | null;
          drive_kind: string | null;
          duration_sec: number | null;
          id: string;
          is_preview: boolean;
          kind: Database['public']['Enums']['lesson_kind'];
          module_id: string;
          position: number;
          published_at: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          banner_public_id?: string | null;
          course_id: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          drive_file_id?: string | null;
          drive_kind?: string | null;
          duration_sec?: number | null;
          id?: string;
          is_preview?: boolean;
          kind?: Database['public']['Enums']['lesson_kind'];
          module_id: string;
          position: number;
          published_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          banner_public_id?: string | null;
          course_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          drive_file_id?: string | null;
          drive_kind?: string | null;
          duration_sec?: number | null;
          id?: string;
          is_preview?: boolean;
          kind?: Database['public']['Enums']['lesson_kind'];
          module_id?: string;
          position?: number;
          published_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lessons_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lessons_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'course_modules';
            referencedColumns: ['id'];
          },
        ];
      };
      live_chat_messages: {
        Row: {
          body: string;
          created_at: string;
          id: number;
          is_hidden: boolean;
          is_pinned: boolean;
          session_id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: number;
          is_hidden?: boolean;
          is_pinned?: boolean;
          session_id: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: number;
          is_hidden?: boolean;
          is_pinned?: boolean;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'live_chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'live_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_chat_messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      live_sessions: {
        Row: {
          actual_peak: number;
          banner_public_id: string | null;
          batch_id: string | null;
          cancelled_reason: string | null;
          course_id: string;
          created_at: string;
          description: string | null;
          educator_id: string;
          ends_at: string;
          id: string;
          join_url: string | null;
          material_drive_id: string | null;
          max_attendees: number | null;
          occurrence_date: string | null;
          provider: Database['public']['Enums']['live_provider'];
          recording_drive_id: string | null;
          reminder_15m_sent_at: string | null;
          reminder_24h_sent_at: string | null;
          schedule_id: string | null;
          starts_at: string;
          status: Database['public']['Enums']['live_status'];
          title: string;
          updated_at: string;
        };
        Insert: {
          actual_peak?: number;
          banner_public_id?: string | null;
          batch_id?: string | null;
          cancelled_reason?: string | null;
          course_id: string;
          created_at?: string;
          description?: string | null;
          educator_id: string;
          ends_at: string;
          id?: string;
          join_url?: string | null;
          material_drive_id?: string | null;
          max_attendees?: number | null;
          occurrence_date?: string | null;
          provider?: Database['public']['Enums']['live_provider'];
          recording_drive_id?: string | null;
          reminder_15m_sent_at?: string | null;
          reminder_24h_sent_at?: string | null;
          schedule_id?: string | null;
          starts_at: string;
          status?: Database['public']['Enums']['live_status'];
          title: string;
          updated_at?: string;
        };
        Update: {
          actual_peak?: number;
          banner_public_id?: string | null;
          batch_id?: string | null;
          cancelled_reason?: string | null;
          course_id?: string;
          created_at?: string;
          description?: string | null;
          educator_id?: string;
          ends_at?: string;
          id?: string;
          join_url?: string | null;
          material_drive_id?: string | null;
          max_attendees?: number | null;
          occurrence_date?: string | null;
          provider?: Database['public']['Enums']['live_provider'];
          recording_drive_id?: string | null;
          reminder_15m_sent_at?: string | null;
          reminder_24h_sent_at?: string | null;
          schedule_id?: string | null;
          starts_at?: string;
          status?: Database['public']['Enums']['live_status'];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'live_sessions_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_sessions_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_sessions_educator_id_fkey';
            columns: ['educator_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_sessions_schedule_id_fkey';
            columns: ['schedule_id'];
            isOneToOne: false;
            referencedRelation: 'class_schedules';
            referencedColumns: ['id'];
          },
        ];
      };
      mentorship_bookings: {
        Row: {
          created_at: string;
          id: string;
          meet_url: string | null;
          notes: string | null;
          order_id: string | null;
          slot_id: string;
          status: string;
          topic: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          meet_url?: string | null;
          notes?: string | null;
          order_id?: string | null;
          slot_id: string;
          status?: string;
          topic?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          meet_url?: string | null;
          notes?: string | null;
          order_id?: string | null;
          slot_id?: string;
          status?: string;
          topic?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentorship_bookings_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentorship_bookings_slot_id_fkey';
            columns: ['slot_id'];
            isOneToOne: true;
            referencedRelation: 'mentorship_slots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentorship_bookings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      mentorship_slots: {
        Row: {
          educator_id: string;
          ends_at: string;
          id: string;
          is_booked: boolean;
          price_inr: number;
          starts_at: string;
        };
        Insert: {
          educator_id: string;
          ends_at: string;
          id?: string;
          is_booked?: boolean;
          price_inr?: number;
          starts_at: string;
        };
        Update: {
          educator_id?: string;
          ends_at?: string;
          id?: string;
          is_booked?: boolean;
          price_inr?: number;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentorship_slots_educator_id_fkey';
            columns: ['educator_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_prefs: {
        Row: {
          email: boolean;
          in_app: boolean;
          push: boolean;
          type: string;
          user_id: string;
        };
        Insert: {
          email?: boolean;
          in_app?: boolean;
          push?: boolean;
          type: string;
          user_id: string;
        };
        Update: {
          email?: boolean;
          in_app?: boolean;
          push?: boolean;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_prefs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          category: string | null;
          created_at: string;
          data: Json;
          id: string;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          category?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          category?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          item_id: string;
          item_type: string;
          order_id: string;
          quantity: number;
          title_snapshot: string;
          unit_price_inr: number;
        };
        Insert: {
          id?: string;
          item_id: string;
          item_type: string;
          order_id: string;
          quantity?: number;
          title_snapshot: string;
          unit_price_inr: number;
        };
        Update: {
          id?: string;
          item_id?: string;
          item_type?: string;
          order_id?: string;
          quantity?: number;
          title_snapshot?: string;
          unit_price_inr?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          coupon_id: string | null;
          created_at: string;
          currency: string;
          discount_inr: number;
          gateway: string;
          gateway_order_id: string | null;
          id: string;
          shipping_address: Json | null;
          status: Database['public']['Enums']['order_status'];
          subtotal_inr: number;
          tax_inr: number;
          total_inr: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          discount_inr?: number;
          gateway?: string;
          gateway_order_id?: string | null;
          id?: string;
          shipping_address?: Json | null;
          status?: Database['public']['Enums']['order_status'];
          subtotal_inr: number;
          tax_inr?: number;
          total_inr: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          discount_inr?: number;
          gateway?: string;
          gateway_order_id?: string | null;
          id?: string;
          shipping_address?: Json | null;
          status?: Database['public']['Enums']['order_status'];
          subtotal_inr?: number;
          tax_inr?: number;
          total_inr?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_coupon_id_fkey';
            columns: ['coupon_id'];
            isOneToOne: false;
            referencedRelation: 'coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_inr: number;
          captured_at: string | null;
          created_at: string;
          gateway_payment_id: string;
          id: string;
          method: string | null;
          order_id: string;
          raw: Json;
          status: string;
        };
        Insert: {
          amount_inr: number;
          captured_at?: string | null;
          created_at?: string;
          gateway_payment_id: string;
          id?: string;
          method?: string | null;
          order_id: string;
          raw: Json;
          status: string;
        };
        Update: {
          amount_inr?: number;
          captured_at?: string | null;
          created_at?: string;
          gateway_payment_id?: string;
          id?: string;
          method?: string | null;
          order_id?: string;
          raw?: Json;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          description: string | null;
          id: number;
          key: string;
        };
        Insert: {
          description?: string | null;
          id?: number;
          key: string;
        };
        Update: {
          description?: string | null;
          id?: number;
          key?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_public_id: string | null;
          is_active: boolean;
          kind: string;
          mrp_inr: number | null;
          price_inr: number;
          slug: string;
          stock: number | null;
          title: string;
          weight_g: number | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_public_id?: string | null;
          is_active?: boolean;
          kind: string;
          mrp_inr?: number | null;
          price_inr: number;
          slug: string;
          stock?: number | null;
          title: string;
          weight_g?: number | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_public_id?: string | null;
          is_active?: boolean;
          kind?: string;
          mrp_inr?: number | null;
          price_inr?: number;
          slug?: string;
          stock?: number | null;
          title?: string;
          weight_g?: number | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          consent_accepted_at: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string;
          exam_target: string | null;
          full_name: string;
          id: string;
          last_seen_at: string | null;
          locale: string;
          onboarded_at: string | null;
          phone: string | null;
          referral_code: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          consent_accepted_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          exam_target?: string | null;
          full_name: string;
          id: string;
          last_seen_at?: string | null;
          locale?: string;
          onboarded_at?: string | null;
          phone?: string | null;
          referral_code?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          consent_accepted_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          exam_target?: string | null;
          full_name?: string;
          id?: string;
          last_seen_at?: string | null;
          locale?: string;
          onboarded_at?: string | null;
          phone?: string | null;
          referral_code?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_attempts: {
        Row: {
          correct_count: number | null;
          expires_at: string;
          id: string;
          quiz_id: string;
          rank: number | null;
          score: number | null;
          skipped_count: number | null;
          started_at: string;
          submitted_at: string | null;
          user_id: string;
          wrong_count: number | null;
        };
        Insert: {
          correct_count?: number | null;
          expires_at: string;
          id?: string;
          quiz_id: string;
          rank?: number | null;
          score?: number | null;
          skipped_count?: number | null;
          started_at?: string;
          submitted_at?: string | null;
          user_id: string;
          wrong_count?: number | null;
        };
        Update: {
          correct_count?: number | null;
          expires_at?: string;
          id?: string;
          quiz_id?: string;
          rank?: number | null;
          score?: number | null;
          skipped_count?: number | null;
          started_at?: string;
          submitted_at?: string | null;
          user_id?: string;
          wrong_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_attempts_quiz_id_fkey';
            columns: ['quiz_id'];
            isOneToOne: false;
            referencedRelation: 'quizzes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quiz_attempts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_options: {
        Row: {
          body: string;
          id: string;
          is_correct: boolean;
          position: number;
          question_id: string;
        };
        Insert: {
          body: string;
          id?: string;
          is_correct?: boolean;
          position: number;
          question_id: string;
        };
        Update: {
          body?: string;
          id?: string;
          is_correct?: boolean;
          position?: number;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_options_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'quiz_questions';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_questions: {
        Row: {
          body: string;
          explanation: string | null;
          id: string;
          image_public_id: string | null;
          marks: number;
          negative: number;
          position: number;
          quiz_id: string;
        };
        Insert: {
          body: string;
          explanation?: string | null;
          id?: string;
          image_public_id?: string | null;
          marks?: number;
          negative?: number;
          position: number;
          quiz_id: string;
        };
        Update: {
          body?: string;
          explanation?: string | null;
          id?: string;
          image_public_id?: string | null;
          marks?: number;
          negative?: number;
          position?: number;
          quiz_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_questions_quiz_id_fkey';
            columns: ['quiz_id'];
            isOneToOne: false;
            referencedRelation: 'quizzes';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_responses: {
        Row: {
          answered_at: string;
          attempt_id: string;
          marks_awarded: number | null;
          option_id: string | null;
          question_id: string;
        };
        Insert: {
          answered_at?: string;
          attempt_id: string;
          marks_awarded?: number | null;
          option_id?: string | null;
          question_id: string;
        };
        Update: {
          answered_at?: string;
          attempt_id?: string;
          marks_awarded?: number | null;
          option_id?: string | null;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_responses_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'quiz_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quiz_responses_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'quiz_options';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quiz_responses_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'quiz_questions';
            referencedColumns: ['id'];
          },
        ];
      };
      quizzes: {
        Row: {
          closes_at: string | null;
          course_id: string | null;
          created_by: string | null;
          description: string | null;
          duration_min: number;
          id: string;
          max_attempts: number;
          negative_mark: number;
          opens_at: string | null;
          shuffle: boolean;
          status: string;
          title: string;
          total_marks: number | null;
        };
        Insert: {
          closes_at?: string | null;
          course_id?: string | null;
          created_by?: string | null;
          description?: string | null;
          duration_min: number;
          id?: string;
          max_attempts?: number;
          negative_mark?: number;
          opens_at?: string | null;
          shuffle?: boolean;
          status?: string;
          title: string;
          total_marks?: number | null;
        };
        Update: {
          closes_at?: string | null;
          course_id?: string | null;
          created_by?: string | null;
          description?: string | null;
          duration_min?: number;
          id?: string;
          max_attempts?: number;
          negative_mark?: number;
          opens_at?: string | null;
          shuffle?: boolean;
          status?: string;
          title?: string;
          total_marks?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quizzes_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quizzes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      refunds: {
        Row: {
          amount_inr: number;
          created_at: string;
          gateway_refund_id: string | null;
          id: string;
          initiated_by: string | null;
          payment_id: string;
          reason: string | null;
          status: string;
        };
        Insert: {
          amount_inr: number;
          created_at?: string;
          gateway_refund_id?: string | null;
          id?: string;
          initiated_by?: string | null;
          payment_id: string;
          reason?: string | null;
          status?: string;
        };
        Update: {
          amount_inr?: number;
          created_at?: string;
          gateway_refund_id?: string | null;
          id?: string;
          initiated_by?: string | null;
          payment_id?: string;
          reason?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refunds_initiated_by_fkey';
            columns: ['initiated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      resource_downloads: {
        Row: {
          created_at: string;
          id: number;
          ip: unknown;
          resource_id: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          ip?: unknown;
          resource_id: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          ip?: unknown;
          resource_id?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'resource_downloads_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'resource_downloads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      resources: {
        Row: {
          course_id: string | null;
          created_at: string;
          download_count: number;
          drive_file_id: string | null;
          id: string;
          is_free: boolean;
          kind: string;
          page_count: number | null;
          published_at: string | null;
          size_bytes: number | null;
          storage_path: string | null;
          title: string;
        };
        Insert: {
          course_id?: string | null;
          created_at?: string;
          download_count?: number;
          drive_file_id?: string | null;
          id?: string;
          is_free?: boolean;
          kind: string;
          page_count?: number | null;
          published_at?: string | null;
          size_bytes?: number | null;
          storage_path?: string | null;
          title: string;
        };
        Update: {
          course_id?: string | null;
          created_at?: string;
          download_count?: number;
          drive_file_id?: string | null;
          id?: string;
          is_free?: boolean;
          kind?: string;
          page_count?: number | null;
          published_at?: string | null;
          size_bytes?: number | null;
          storage_path?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'resources_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          permission_id: number;
          role_id: number;
        };
        Insert: {
          permission_id: number;
          role_id: number;
        };
        Update: {
          permission_id?: number;
          role_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_id_fkey';
            columns: ['permission_id'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_permissions_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          description: string | null;
          id: number;
          key: Database['public']['Enums']['app_role'];
          name: string;
        };
        Insert: {
          description?: string | null;
          id?: number;
          key: Database['public']['Enums']['app_role'];
          name: string;
        };
        Update: {
          description?: string | null;
          id?: number;
          key?: Database['public']['Enums']['app_role'];
          name?: string;
        };
        Relationships: [];
      };
      schedule_exceptions: {
        Row: {
          action: string;
          id: string;
          new_starts_at: string | null;
          occurrence_date: string;
          reason: string | null;
          schedule_id: string;
        };
        Insert: {
          action: string;
          id?: string;
          new_starts_at?: string | null;
          occurrence_date: string;
          reason?: string | null;
          schedule_id: string;
        };
        Update: {
          action?: string;
          id?: string;
          new_starts_at?: string | null;
          occurrence_date?: string;
          reason?: string | null;
          schedule_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'schedule_exceptions_schedule_id_fkey';
            columns: ['schedule_id'];
            isOneToOne: false;
            referencedRelation: 'class_schedules';
            referencedColumns: ['id'];
          },
        ];
      };
      session_attendance: {
        Row: {
          joined_at: string;
          last_seen_at: string;
          session_id: string;
          user_id: string;
        };
        Insert: {
          joined_at?: string;
          last_seen_at?: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          last_seen_at?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_attendance_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'live_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      support_tickets: {
        Row: {
          assigned_to: string | null;
          category: string | null;
          created_at: string;
          first_response_at: string | null;
          id: string;
          priority: Database['public']['Enums']['priority_level'];
          ref: string;
          resolved_at: string | null;
          sla_due_at: string | null;
          status: Database['public']['Enums']['ticket_status'];
          subject: string;
          user_id: string;
        };
        Insert: {
          assigned_to?: string | null;
          category?: string | null;
          created_at?: string;
          first_response_at?: string | null;
          id?: string;
          priority?: Database['public']['Enums']['priority_level'];
          ref?: string;
          resolved_at?: string | null;
          sla_due_at?: string | null;
          status?: Database['public']['Enums']['ticket_status'];
          subject: string;
          user_id: string;
        };
        Update: {
          assigned_to?: string | null;
          category?: string | null;
          created_at?: string;
          first_response_at?: string | null;
          id?: string;
          priority?: Database['public']['Enums']['priority_level'];
          ref?: string;
          resolved_at?: string | null;
          sla_due_at?: string | null;
          status?: Database['public']['Enums']['ticket_status'];
          subject?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_tickets_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_tickets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ticket_messages: {
        Row: {
          attachments: Json;
          body: string;
          created_at: string;
          id: string;
          is_internal: boolean;
          sender_id: string;
          ticket_id: string;
        };
        Insert: {
          attachments?: Json;
          body: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          sender_id: string;
          ticket_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          sender_id?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ticket_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ticket_messages_ticket_id_fkey';
            columns: ['ticket_id'];
            isOneToOne: false;
            referencedRelation: 'support_tickets';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role_id: number;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role_id: number;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_sessions: {
        Row: {
          created_at: string;
          device_id: string;
          device_label: string | null;
          id: string;
          ip: unknown;
          last_seen_at: string;
          revoke_reason: string | null;
          revoked_at: string | null;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          device_label?: string | null;
          id?: string;
          ip?: unknown;
          last_seen_at?: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          device_label?: string | null;
          id?: string;
          ip?: unknown;
          last_seen_at?: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      webhook_events: {
        Row: {
          attempts: number;
          error: string | null;
          event_id: string;
          event_type: string;
          id: string;
          payload: Json;
          processed_at: string | null;
          provider: string;
          received_at: string;
          status: string;
        };
        Insert: {
          attempts?: number;
          error?: string | null;
          event_id: string;
          event_type: string;
          id?: string;
          payload: Json;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
          status?: string;
        };
        Update: {
          attempts?: number;
          error?: string | null;
          event_id?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_session: {
        Args: {
          p_device_id: string;
          p_ip?: unknown;
          p_label?: string;
          p_user_agent?: string;
        };
        Returns: {
          evicted_count: number;
          session_id: string;
        }[];
      };
      current_role_keys: {
        Args: never;
        Returns: Database['public']['Enums']['app_role'][];
      };
      email_quota_today: {
        Args: never;
        Returns: {
          daily_cap: number;
          pct_used: number;
          sent_today: number;
        }[];
      };
      generate_sessions: {
        Args: { p_horizon_days?: number; p_schedule: string };
        Returns: number;
      };
      get_live_join_url: { Args: { p_session: string }; Returns: string };
      has_role: {
        Args: { p: Database['public']['Enums']['app_role'] };
        Returns: boolean;
      };
      is_email_suppressed: { Args: { p_email: string }; Returns: boolean };
      is_enrolled: { Args: { p_course: string }; Returns: boolean };
      is_staff: { Args: never; Returns: boolean };
      revoke_other_sessions: {
        Args: { p_keep_device: string };
        Returns: number;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      support_is_open: { Args: { p_at?: string }; Returns: boolean };
    };
    Enums: {
      app_role: 'student' | 'educator' | 'admin' | 'support' | 'developer';
      course_status: 'draft' | 'pending_review' | 'published' | 'archived';
      doubt_status: 'open' | 'answered' | 'resolved' | 'closed';
      email_event_type:
        | 'email.sent'
        | 'email.delivered'
        | 'email.delivery_delayed'
        | 'email.bounced'
        | 'email.complained'
        | 'email.opened'
        | 'email.clicked'
        | 'email.failed';
      email_status: 'queued' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained' | 'failed';
      enrollment_state: 'active' | 'expired' | 'refunded' | 'suspended';
      lesson_kind: 'video' | 'pdf' | 'quiz' | 'live' | 'text';
      live_provider: 'meet' | 'youtube' | 'livekit';
      live_status: 'scheduled' | 'live' | 'ended' | 'cancelled';
      order_status: 'created' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
      priority_level: 'low' | 'medium' | 'high' | 'urgent';
      setting_type:
        | 'boolean'
        | 'integer'
        | 'number'
        | 'string'
        | 'text'
        | 'enum'
        | 'json'
        | 'duration_minutes'
        | 'color'
        | 'url'
        | 'email';
      ticket_status: 'open' | 'pending' | 'resolved' | 'closed';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['student', 'educator', 'admin', 'support', 'developer'],
      course_status: ['draft', 'pending_review', 'published', 'archived'],
      doubt_status: ['open', 'answered', 'resolved', 'closed'],
      email_event_type: [
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.bounced',
        'email.complained',
        'email.opened',
        'email.clicked',
        'email.failed',
      ],
      email_status: ['queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed'],
      enrollment_state: ['active', 'expired', 'refunded', 'suspended'],
      lesson_kind: ['video', 'pdf', 'quiz', 'live', 'text'],
      live_provider: ['meet', 'youtube', 'livekit'],
      live_status: ['scheduled', 'live', 'ended', 'cancelled'],
      order_status: ['created', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      priority_level: ['low', 'medium', 'high', 'urgent'],
      setting_type: [
        'boolean',
        'integer',
        'number',
        'string',
        'text',
        'enum',
        'json',
        'duration_minutes',
        'color',
        'url',
        'email',
      ],
      ticket_status: ['open', 'pending', 'resolved', 'closed'],
    },
  },
} as const;
