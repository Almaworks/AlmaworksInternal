export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      access_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          reason: string | null
          requested_role: Database["public"]["Enums"]["user_role"]
          requester_profile_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          semester_id: string
          startup_name: string | null
          status: Database["public"]["Enums"]["access_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          reason?: string | null
          requested_role: Database["public"]["Enums"]["user_role"]
          requester_profile_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          semester_id: string
          startup_name?: string | null
          status?: Database["public"]["Enums"]["access_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          reason?: string | null
          requested_role?: Database["public"]["Enums"]["user_role"]
          requester_profile_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          semester_id?: string
          startup_name?: string | null
          status?: Database["public"]["Enums"]["access_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_registration_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          requested_password: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          temp_password: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          requested_password?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          temp_password?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          requested_password?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          temp_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_registration_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          public_key_fingerprint: string | null
          public_key_jwk: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          public_key_fingerprint?: string | null
          public_key_jwk?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          public_key_fingerprint?: string | null
          public_key_jwk?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      availability: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          session_date_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          session_date_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          session_date_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_session_date_id_fkey"
            columns: ["session_date_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_windows: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          profile_id: string | null
          semester_id: string
          source: string
          starts_at: string
          startup_semester_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          profile_id?: string | null
          semester_id: string
          source?: string
          starts_at: string
          startup_semester_id?: string | null
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          profile_id?: string | null
          semester_id?: string
          source?: string
          starts_at?: string
          startup_semester_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_windows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_windows_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_windows_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_delivery_attempts: {
        Row: {
          attempted_at: string
          error_code: string | null
          error_message: string | null
          id: string
          invitation_id: string
          outcome: string
          provider: string
          provider_message_id: string | null
          semester_id: string
        }
        Insert: {
          attempted_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          invitation_id: string
          outcome: string
          provider: string
          provider_message_id?: string | null
          semester_id: string
        }
        Update: {
          attempted_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          invitation_id?: string
          outcome?: string
          provider?: string
          provider_message_id?: string | null
          semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_delivery_attempts_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_delivery_attempts_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string
          id: string
          invited_by: string
          last_error_code: string | null
          last_error_message: string | null
          matched_profile_id: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          semester_id: string
          send_attempts: number
          sent_at: string | null
          startup_semester_id: string | null
          status: Database["public"]["Enums"]["invitation_lifecycle_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          full_name: string
          id?: string
          invited_by: string
          last_error_code?: string | null
          last_error_message?: string | null
          matched_profile_id?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["user_role"]
          semester_id: string
          send_attempts?: number
          sent_at?: string | null
          startup_semester_id?: string | null
          status?: Database["public"]["Enums"]["invitation_lifecycle_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          invited_by?: string
          last_error_code?: string | null
          last_error_message?: string | null
          matched_profile_id?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          semester_id?: string
          send_attempts?: number
          sent_at?: string | null
          startup_semester_id?: string | null
          status?: Database["public"]["Enums"]["invitation_lifecycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_matched_profile_id_fkey"
            columns: ["matched_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_audit_events: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          details: Json
          id: string
          semester_id: string
          subject_id: string | null
          subject_type: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          semester_id: string
          subject_id?: string | null
          subject_type: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          semester_id?: string
          subject_id?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_audit_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_audit_events_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_configuration_templates: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string | null
          id: string
          is_recommended: boolean
          name: string
          version: number
        }
        Insert: {
          configuration: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_recommended?: boolean
          name: string
          version: number
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_recommended?: boolean
          name?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_configuration_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_assignment_audit: {
        Row: {
          action: string
          actor_profile_id: string
          created_at: string
          id: string
          idempotency_key: string
          mentor_profile_id: string
          override_reason: string | null
          override_types: string[]
          ranking_context: Json
          request_id: string
          semester_id: string
          session_date_id: string
          session_id: string
          startup_semester_id: string
          time_slot: string
        }
        Insert: {
          action?: string
          actor_profile_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          mentor_profile_id: string
          override_reason?: string | null
          override_types?: string[]
          ranking_context?: Json
          request_id: string
          semester_id: string
          session_date_id: string
          session_id: string
          startup_semester_id: string
          time_slot: string
        }
        Update: {
          action?: string
          actor_profile_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          mentor_profile_id?: string
          override_reason?: string | null
          override_types?: string[]
          ranking_context?: Json
          request_id?: string
          semester_id?: string
          session_date_id?: string
          session_id?: string
          startup_semester_id?: string
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_assignment_audit_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_audit_mentor_profile_id_fkey"
            columns: ["mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "mentor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mentor_assignment_audit_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "mentor_assignment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_audit_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_audit_session_date_id_fkey"
            columns: ["session_date_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_audit_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_audit_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_assignment_requests: {
        Row: {
          actor_profile_id: string
          created_at: string
          id: string
          idempotency_key: string
          mentor_profile_id: string
          request_fingerprint: string
          request_payload: Json
          semester_id: string
          session_date_id: string
          session_id: string | null
          startup_semester_id: string
          time_slot: string
        }
        Insert: {
          actor_profile_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          mentor_profile_id: string
          request_fingerprint: string
          request_payload: Json
          semester_id: string
          session_date_id: string
          session_id?: string | null
          startup_semester_id: string
          time_slot: string
        }
        Update: {
          actor_profile_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          mentor_profile_id?: string
          request_fingerprint?: string
          request_payload?: Json
          semester_id?: string
          session_date_id?: string
          session_id?: string | null
          startup_semester_id?: string
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_assignment_requests_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_requests_mentor_profile_id_fkey"
            columns: ["mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "mentor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mentor_assignment_requests_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_requests_session_date_id_fkey"
            columns: ["session_date_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignment_requests_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_profiles: {
        Row: {
          biography: string | null
          company: string | null
          created_at: string
          expertise_tags: string[]
          linkedin_url: string | null
          photo_url: string | null
          profile_id: string
          title: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          biography?: string | null
          company?: string | null
          created_at?: string
          expertise_tags?: string[]
          linkedin_url?: string | null
          photo_url?: string | null
          profile_id: string
          title?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          biography?: string | null
          company?: string | null
          created_at?: string
          expertise_tags?: string[]
          linkedin_url?: string | null
          photo_url?: string | null
          profile_id?: string
          title?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_semesters: {
        Row: {
          capacity: number
          created_at: string
          id: string
          mentorship_goals: string | null
          preferred_format: string | null
          readiness_status: string
          semester_id: string
          semester_membership_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          mentorship_goals?: string | null
          preferred_format?: string | null
          readiness_status?: string
          semester_id: string
          semester_membership_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          mentorship_goals?: string | null
          preferred_format?: string | null
          readiness_status?: string
          semester_id?: string
          semester_membership_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_semesters_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_semesters_semester_membership_id_fkey"
            columns: ["semester_membership_id"]
            isOneToOne: false
            referencedRelation: "semester_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors: {
        Row: {
          bio: string | null
          company: string | null
          created_at: string
          email: string | null
          expertise_tags: string[]
          full_name: string
          general_availability: string | null
          id: string
          is_active: boolean
          linkedin_url: string | null
          mentorship_goals: string | null
          opening_talk: string | null
          per_week_availability: Json
          photo_url: string | null
          preferred_format: string | null
          role_title: string | null
          semester_id: string
          slug: string | null
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          expertise_tags?: string[]
          full_name: string
          general_availability?: string | null
          id?: string
          is_active?: boolean
          linkedin_url?: string | null
          mentorship_goals?: string | null
          opening_talk?: string | null
          per_week_availability?: Json
          photo_url?: string | null
          preferred_format?: string | null
          role_title?: string | null
          semester_id: string
          slug?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          expertise_tags?: string[]
          full_name?: string
          general_availability?: string | null
          id?: string
          is_active?: boolean
          linkedin_url?: string | null
          mentorship_goals?: string | null
          opening_talk?: string | null
          per_week_availability?: Json
          photo_url?: string | null
          preferred_format?: string | null
          role_title?: string | null
          semester_id?: string
          slug?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentors_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_required: boolean
          item_key: string
          payload: Json
          semester_id: string
          semester_membership_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_required: boolean
          item_key: string
          payload?: Json
          semester_id: string
          semester_membership_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          item_key?: string
          payload?: Json
          semester_id?: string
          semester_membership_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_semester_membership_id_fkey"
            columns: ["semester_membership_id"]
            isOneToOne: false
            referencedRelation: "semester_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach: {
        Row: {
          admin_id: string | null
          company: string | null
          converted_mentor_id: string | null
          created_at: string
          expertise_tags: string[]
          id: string
          last_contacted_at: string | null
          linkedin_url: string | null
          notes: string | null
          outreach_type: string[]
          prospect_email: string | null
          prospect_name: string
          referred_by: string | null
          semester_id: string
          source_channel: string | null
          status: Database["public"]["Enums"]["outreach_status"]
          updated_at: string
          who_reached_out: string | null
        }
        Insert: {
          admin_id?: string | null
          company?: string | null
          converted_mentor_id?: string | null
          created_at?: string
          expertise_tags?: string[]
          id?: string
          last_contacted_at?: string | null
          linkedin_url?: string | null
          notes?: string | null
          outreach_type?: string[]
          prospect_email?: string | null
          prospect_name: string
          referred_by?: string | null
          semester_id: string
          source_channel?: string | null
          status?: Database["public"]["Enums"]["outreach_status"]
          updated_at?: string
          who_reached_out?: string | null
        }
        Update: {
          admin_id?: string | null
          company?: string | null
          converted_mentor_id?: string | null
          created_at?: string
          expertise_tags?: string[]
          id?: string
          last_contacted_at?: string | null
          linkedin_url?: string | null
          notes?: string | null
          outreach_type?: string[]
          prospect_email?: string | null
          prospect_name?: string
          referred_by?: string | null
          semester_id?: string
          source_channel?: string | null
          status?: Database["public"]["Enums"]["outreach_status"]
          updated_at?: string
          who_reached_out?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_converted_mentor_id_fkey"
            columns: ["converted_mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_activities: {
        Row: {
          activity_kind: Database["public"]["Enums"]["outreach_activity_kind"]
          actor_profile_id: string | null
          channel: Database["public"]["Enums"]["outreach_channel"] | null
          created_at: string
          details: Json
          external_message_id: string | null
          id: string
          import_job_id: string | null
          new_owner_profile_id: string | null
          occurred_at: string
          opportunity_id: string
          previous_owner_profile_id: string | null
          semester_id: string
          summary: string | null
          supersedes_activity_id: string | null
        }
        Insert: {
          activity_kind: Database["public"]["Enums"]["outreach_activity_kind"]
          actor_profile_id?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"] | null
          created_at?: string
          details?: Json
          external_message_id?: string | null
          id?: string
          import_job_id?: string | null
          new_owner_profile_id?: string | null
          occurred_at?: string
          opportunity_id: string
          previous_owner_profile_id?: string | null
          semester_id: string
          summary?: string | null
          supersedes_activity_id?: string | null
        }
        Update: {
          activity_kind?: Database["public"]["Enums"]["outreach_activity_kind"]
          actor_profile_id?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"] | null
          created_at?: string
          details?: Json
          external_message_id?: string | null
          id?: string
          import_job_id?: string | null
          new_owner_profile_id?: string | null
          occurred_at?: string
          opportunity_id?: string
          previous_owner_profile_id?: string | null
          semester_id?: string
          summary?: string | null
          supersedes_activity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_activities_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_new_owner_profile_id_fkey"
            columns: ["new_owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_previous_owner_profile_id_fkey"
            columns: ["previous_owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_semester_id_import_job_id_fkey"
            columns: ["semester_id", "import_job_id"]
            isOneToOne: false
            referencedRelation: "outreach_import_jobs"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "outreach_activities_semester_id_opportunity_id_fkey"
            columns: ["semester_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "outreach_opportunities"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "outreach_activities_semester_id_opportunity_id_supersedes__fkey"
            columns: ["semester_id", "opportunity_id", "supersedes_activity_id"]
            isOneToOne: false
            referencedRelation: "outreach_activities"
            referencedColumns: ["semester_id", "opportunity_id", "id"]
          },
        ]
      }
      outreach_activity_log: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string
          detail: Json
          id: string
          outreach_id: string
          semester_id: string
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          detail?: Json
          id?: string
          outreach_id: string
          semester_id: string
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          detail?: Json
          id?: string
          outreach_id?: string
          semester_id?: string
        }
        Relationships: []
      }
      outreach_companies: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          domain: string | null
          id: string
          name: string
          normalized_name: string
          sector: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          name: string
          normalized_name: string
          sector?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          name?: string
          normalized_name?: string
          sector?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_contact_companies: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          ended_on: string | null
          id: string
          is_primary: boolean
          started_on: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          started_on?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          started_on?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contact_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "outreach_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contact_companies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_contacts: {
        Row: {
          biography: string | null
          canonical_linkedin_url: string | null
          created_at: string
          created_by: string | null
          email: string | null
          expertise_tags: string[]
          full_name: string
          id: string
          linkedin_url: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          biography?: string | null
          canonical_linkedin_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expertise_tags?: string[]
          full_name: string
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          biography?: string | null
          canonical_linkedin_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expertise_tags?: string[]
          full_name?: string
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_import_jobs: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string | null
          last_error: string | null
          rolled_back_at: string | null
          semester_id: string
          source: string
          source_filename: string | null
          status: Database["public"]["Enums"]["outreach_import_status"]
          summary: Json
          updated_at: string
        }
        Insert: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          rolled_back_at?: string | null
          semester_id: string
          source: string
          source_filename?: string | null
          status?: Database["public"]["Enums"]["outreach_import_status"]
          summary?: Json
          updated_at?: string
        }
        Update: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          rolled_back_at?: string | null
          semester_id?: string
          source?: string
          source_filename?: string | null
          status?: Database["public"]["Enums"]["outreach_import_status"]
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_import_jobs_committed_by_fkey"
            columns: ["committed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_import_jobs_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_import_rows: {
        Row: {
          committed_opportunity_id: string | null
          created_at: string
          excluded: boolean
          excluded_reason: string | null
          id: string
          import_job_id: string
          issue_codes: string[]
          match_decision: Database["public"]["Enums"]["outreach_import_match_decision"]
          matched_company_id: string | null
          matched_contact_id: string | null
          normalized_payload: Json
          raw_payload: Json
          row_number: number
          selected: boolean
          semester_id: string
          updated_at: string
        }
        Insert: {
          committed_opportunity_id?: string | null
          created_at?: string
          excluded?: boolean
          excluded_reason?: string | null
          id?: string
          import_job_id: string
          issue_codes?: string[]
          match_decision?: Database["public"]["Enums"]["outreach_import_match_decision"]
          matched_company_id?: string | null
          matched_contact_id?: string | null
          normalized_payload?: Json
          raw_payload: Json
          row_number: number
          selected?: boolean
          semester_id: string
          updated_at?: string
        }
        Update: {
          committed_opportunity_id?: string | null
          created_at?: string
          excluded?: boolean
          excluded_reason?: string | null
          id?: string
          import_job_id?: string
          issue_codes?: string[]
          match_decision?: Database["public"]["Enums"]["outreach_import_match_decision"]
          matched_company_id?: string | null
          matched_contact_id?: string | null
          normalized_payload?: Json
          raw_payload?: Json
          row_number?: number
          selected?: boolean
          semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_import_rows_matched_company_id_fkey"
            columns: ["matched_company_id"]
            isOneToOne: false
            referencedRelation: "outreach_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_import_rows_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_import_rows_semester_id_committed_opportunity_id_fkey"
            columns: ["semester_id", "committed_opportunity_id"]
            isOneToOne: false
            referencedRelation: "outreach_opportunities"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "outreach_import_rows_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_import_rows_semester_id_import_job_id_fkey"
            columns: ["semester_id", "import_job_id"]
            isOneToOne: false
            referencedRelation: "outreach_import_jobs"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      outreach_opportunities: {
        Row: {
          cadence_days: number
          contact_id: string
          conversion_details: Json
          converted_mentor_profile_id: string | null
          converted_startup_semester_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          notes: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          semester_id: string
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_import_job_id: string | null
          stage: Database["public"]["Enums"]["outreach_stage"]
          updated_at: string
        }
        Insert: {
          cadence_days?: number
          contact_id: string
          conversion_details?: Json
          converted_mentor_profile_id?: string | null
          converted_startup_semester_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_silenced?: boolean
          latest_inbound_activity_at?: string | null
          latest_outbound_activity_at?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          owner_profile_id?: string | null
          priority?: number
          referred_by?: string | null
          semester_id: string
          silence_reason?: string | null
          silenced_at?: string | null
          silenced_by?: string | null
          snoozed_until?: string | null
          source_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          source_import_job_id?: string | null
          stage?: Database["public"]["Enums"]["outreach_stage"]
          updated_at?: string
        }
        Update: {
          cadence_days?: number
          contact_id?: string
          conversion_details?: Json
          converted_mentor_profile_id?: string | null
          converted_startup_semester_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_silenced?: boolean
          latest_inbound_activity_at?: string | null
          latest_outbound_activity_at?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          owner_profile_id?: string | null
          priority?: number
          referred_by?: string | null
          semester_id?: string
          silence_reason?: string | null
          silenced_at?: string | null
          silenced_by?: string | null
          snoozed_until?: string | null
          source_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          source_import_job_id?: string | null
          stage?: Database["public"]["Enums"]["outreach_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunities_converted_mentor_profile_id_fkey"
            columns: ["converted_mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "mentor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "outreach_opportunities_converted_startup_semester_id_fkey"
            columns: ["converted_startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunities_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunities_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunities_semester_id_source_import_job_id_fkey"
            columns: ["semester_id", "source_import_job_id"]
            isOneToOne: false
            referencedRelation: "outreach_import_jobs"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "outreach_opportunities_silenced_by_fkey"
            columns: ["silenced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_opportunity_labels: {
        Row: {
          added_at: string
          added_by: string | null
          opportunity_id: string
          relationship_label_id: string
          semester_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          opportunity_id: string
          relationship_label_id: string
          semester_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          opportunity_id?: string
          relationship_label_id?: string
          semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_opportunity_labels_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunity_labels_relationship_label_id_fkey"
            columns: ["relationship_label_id"]
            isOneToOne: false
            referencedRelation: "outreach_relationship_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunity_labels_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_opportunity_labels_semester_id_opportunity_id_fkey"
            columns: ["semester_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "outreach_opportunities"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      outreach_relationship_labels: {
        Row: {
          color_token: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color_token?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color_token?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_relationship_labels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          profile_id: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["platform_role"]
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          semester_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role: Database["public"]["Enums"]["user_role"]
          semester_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          semester_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semester_memberships: {
        Row: {
          activated_at: string | null
          alumni_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          semester_id: string
          status: Database["public"]["Enums"]["membership_lifecycle_status"]
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          alumni_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          semester_id: string
          status?: Database["public"]["Enums"]["membership_lifecycle_status"]
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          alumni_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          semester_id?: string
          status?: Database["public"]["Enums"]["membership_lifecycle_status"]
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semester_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semester_memberships_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          archived_at: string | null
          closed_at: string | null
          configuration: Json
          configuration_template_version: number | null
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          lifecycle_status: Database["public"]["Enums"]["semester_lifecycle_status"]
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          closed_at?: string | null
          configuration?: Json
          configuration_template_version?: number | null
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          lifecycle_status?: Database["public"]["Enums"]["semester_lifecycle_status"]
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          closed_at?: string | null
          configuration?: Json
          configuration_template_version?: number | null
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          lifecycle_status?: Database["public"]["Enums"]["semester_lifecycle_status"]
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_dates: {
        Row: {
          created_at: string
          date: string
          id: string
          label: string | null
          semester_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          label?: string | null
          semester_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          label?: string | null
          semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_dates_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          format: string | null
          id: string
          is_confirmed: boolean
          mentor_id: string
          notes: string | null
          requested_at: string
          semester_id: string
          session_date_id: string
          startup_absent: boolean
          startup_id: string | null
          status: Database["public"]["Enums"]["session_status"]
          substitute_name: string | null
          time_slot: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          format?: string | null
          id?: string
          is_confirmed?: boolean
          mentor_id: string
          notes?: string | null
          requested_at?: string
          semester_id: string
          session_date_id: string
          startup_absent?: boolean
          startup_id?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          substitute_name?: string | null
          time_slot?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          format?: string | null
          id?: string
          is_confirmed?: boolean
          mentor_id?: string
          notes?: string | null
          requested_at?: string
          semester_id?: string
          session_date_id?: string
          startup_absent?: boolean
          startup_id?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          substitute_name?: string | null
          time_slot?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_session_date_id_fkey"
            columns: ["session_date_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_organizations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      startup_semesters: {
        Row: {
          company_snapshot: string | null
          created_at: string
          goals: string[]
          id: string
          mentor_need_context: string | null
          mentor_need_no_preference: boolean
          mentorship_needs: string[]
          preferred_expertise_tags: string[]
          readiness_status: string
          semester_id: string
          stage: Database["public"]["Enums"]["startup_stage"] | null
          startup_organization_id: string
          updated_at: string
        }
        Insert: {
          company_snapshot?: string | null
          created_at?: string
          goals?: string[]
          id?: string
          mentor_need_context?: string | null
          mentor_need_no_preference?: boolean
          mentorship_needs?: string[]
          preferred_expertise_tags?: string[]
          readiness_status?: string
          semester_id: string
          stage?: Database["public"]["Enums"]["startup_stage"] | null
          startup_organization_id: string
          updated_at?: string
        }
        Update: {
          company_snapshot?: string | null
          created_at?: string
          goals?: string[]
          id?: string
          mentor_need_context?: string | null
          mentor_need_no_preference?: boolean
          mentorship_needs?: string[]
          preferred_expertise_tags?: string[]
          readiness_status?: string
          semester_id?: string
          stage?: Database["public"]["Enums"]["startup_stage"] | null
          startup_organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_semesters_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_semesters_startup_organization_id_fkey"
            columns: ["startup_organization_id"]
            isOneToOne: false
            referencedRelation: "startup_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_team_memberships: {
        Row: {
          created_at: string
          id: string
          is_primary_contact: boolean
          semester_id: string
          semester_membership_id: string
          startup_semester_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          semester_id: string
          semester_membership_id: string
          startup_semester_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          semester_id?: string
          semester_membership_id?: string
          startup_semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_team_memberships_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_team_memberships_semester_membership_id_fkey"
            columns: ["semester_membership_id"]
            isOneToOne: false
            referencedRelation: "semester_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_team_memberships_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          created_at: string
          description: string | null
          founder_name: string | null
          founders: Json
          id: string
          industry: string | null
          is_active: boolean
          logo_url: string | null
          mentor_preferences: string | null
          mentorship_needs: string[]
          name: string
          preferred_tags: string[]
          semester_goals: string[]
          semester_id: string
          slug: string | null
          stage: Database["public"]["Enums"]["startup_stage"] | null
          updated_at: string
          user_id: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          founder_name?: string | null
          founders?: Json
          id?: string
          industry?: string | null
          is_active?: boolean
          logo_url?: string | null
          mentor_preferences?: string | null
          mentorship_needs?: string[]
          name: string
          preferred_tags?: string[]
          semester_goals?: string[]
          semester_id: string
          slug?: string | null
          stage?: Database["public"]["Enums"]["startup_stage"] | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          founder_name?: string | null
          founders?: Json
          id?: string
          industry?: string | null
          is_active?: boolean
          logo_url?: string | null
          mentor_preferences?: string | null
          mentorship_needs?: string[]
          name?: string
          preferred_tags?: string[]
          semester_goals?: string[]
          semester_id?: string
          slug?: string | null
          stage?: Database["public"]["Enums"]["startup_stage"] | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startups_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_application_data_keys: {
        Row: {
          agent_id: string
          algorithm: string
          created_at: string
          encrypted_data_key: string
          order_id: string
        }
        Insert: {
          agent_id: string
          algorithm?: string
          created_at?: string
          encrypted_data_key: string
          order_id: string
        }
        Update: {
          agent_id?: string
          algorithm?: string
          created_at?: string
          encrypted_data_key?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_application_data_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_application_data_keys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "visa_application_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_application_drafts: {
        Row: {
          created_at: string
          destination_country: string
          id: string
          passport_type: string
          status: string
          travelers_count: number
          updated_at: string
          visa_type: string | null
        }
        Insert: {
          created_at?: string
          destination_country?: string
          id?: string
          passport_type: string
          status?: string
          travelers_count: number
          updated_at?: string
          visa_type?: string | null
        }
        Update: {
          created_at?: string
          destination_country?: string
          id?: string
          passport_type?: string
          status?: string
          travelers_count?: number
          updated_at?: string
          visa_type?: string | null
        }
        Relationships: []
      }
      visa_application_orders: {
        Row: {
          consular_fee_cents: number | null
          contact_email: string | null
          created_at: string
          destination_country: string
          draft_id: string
          id: string
          insurance_fee_cents: number | null
          paid_at: string | null
          passport_type: string
          processing_completed_at: string | null
          processing_due_at: string | null
          processing_started_at: string | null
          processing_tier: string | null
          service_fee_cents: number | null
          shipping_address: Json | null
          shipping_fee_cents: number | null
          shipping_tier: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          terms_agreed_at: string | null
          terms_agreed_ip: string | null
          terms_user_agent: string | null
          terms_version: string | null
          travelers_count: number
          updated_at: string
          visa_type: string | null
        }
        Insert: {
          consular_fee_cents?: number | null
          contact_email?: string | null
          created_at?: string
          destination_country?: string
          draft_id: string
          id?: string
          insurance_fee_cents?: number | null
          paid_at?: string | null
          passport_type: string
          processing_completed_at?: string | null
          processing_due_at?: string | null
          processing_started_at?: string | null
          processing_tier?: string | null
          service_fee_cents?: number | null
          shipping_address?: Json | null
          shipping_fee_cents?: number | null
          shipping_tier?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          terms_agreed_at?: string | null
          terms_agreed_ip?: string | null
          terms_user_agent?: string | null
          terms_version?: string | null
          travelers_count: number
          updated_at?: string
          visa_type?: string | null
        }
        Update: {
          consular_fee_cents?: number | null
          contact_email?: string | null
          created_at?: string
          destination_country?: string
          draft_id?: string
          id?: string
          insurance_fee_cents?: number | null
          paid_at?: string | null
          passport_type?: string
          processing_completed_at?: string | null
          processing_due_at?: string | null
          processing_started_at?: string | null
          processing_tier?: string | null
          service_fee_cents?: number | null
          shipping_address?: Json | null
          shipping_fee_cents?: number | null
          shipping_tier?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          terms_agreed_at?: string | null
          terms_agreed_ip?: string | null
          terms_user_agent?: string | null
          terms_version?: string | null
          travelers_count?: number
          updated_at?: string
          visa_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_application_orders_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "visa_application_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_application_passenger_payloads: {
        Row: {
          ciphertext: string
          created_at: string
          iv: string
          order_id: string
          passenger_index: number
          payload_type: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          iv: string
          order_id: string
          passenger_index: number
          payload_type: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          iv?: string
          order_id?: string
          passenger_index?: number
          payload_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_application_passenger_payloads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "visa_application_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_business_key: {
        Row: {
          id: boolean
          public_key_jwk: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          public_key_jwk: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          public_key_jwk?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_business_key_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_semester_transition: {
        Args: { p_source_semester_id: string; p_target_semester_id: string }
        Returns: {
          active_semester_id: string
          alumni_count: number
          closed_semester_id: string
        }[]
      }
      bulk_set_membership_activity: {
        Args: {
          p_is_active: boolean
          p_membership_ids: string[]
          p_semester_id: string
        }
        Returns: number
      }
      can_manage_any_outreach: {
        Args: { candidate_id?: string }
        Returns: boolean
      }
      can_manage_semester: {
        Args: { candidate_id?: string; target_semester_id: string }
        Returns: boolean
      }
      can_read_outreach_relationship_labels: {
        Args: { candidate_id?: string }
        Returns: boolean
      }
      commit_legacy_outreach_migration: {
        Args: { p_idempotency_key: string; p_semester_id: string }
        Returns: Json
      }
      commit_mentor_assignment: {
        Args: {
          p_format?: string
          p_idempotency_key: string
          p_mentor_profile_id: string
          p_override_reason?: string
          p_override_types?: string[]
          p_ranking_context?: Json
          p_semester_id: string
          p_session_date_id: string
          p_startup_semester_id: string
          p_time_slot: string
          p_topic?: string
        }
        Returns: Json
      }
      create_semester_draft: {
        Args: {
          p_configuration: Json
          p_end_date: string
          p_name: string
          p_source_semester_id: string
          p_start_date: string
        }
        Returns: {
          semester_id: string
          semester_name: string
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_outreach_company_access: {
        Args: { candidate_id?: string; target_company_id: string }
        Returns: boolean
      }
      has_outreach_contact_access: {
        Args: { candidate_id?: string; target_contact_id: string }
        Returns: boolean
      }
      has_semester_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["user_role"][]
          candidate_id?: string
          target_semester_id: string
        }
        Returns: boolean
      }
      import_prior_semester_memberships: {
        Args: {
          p_membership_ids?: string[]
          p_source_semester_id: string
          p_target_semester_id: string
        }
        Returns: {
          imported_count: number
          skipped_count: number
          source_count: number
        }[]
      }
      is_super_admin: { Args: { candidate_id?: string }; Returns: boolean }
      log_outreach_activity: {
        Args: {
          p_activity_kind: Database["public"]["Enums"]["outreach_activity_kind"]
          p_channel?: Database["public"]["Enums"]["outreach_channel"]
          p_details?: Json
          p_expected_updated_at?: string
          p_next_follow_up_at?: string
          p_occurred_at?: string
          p_opportunity_id: string
          p_stage?: Database["public"]["Enums"]["outreach_stage"]
          p_summary?: string
        }
        Returns: {
          activity_kind: Database["public"]["Enums"]["outreach_activity_kind"]
          actor_profile_id: string | null
          channel: Database["public"]["Enums"]["outreach_channel"] | null
          created_at: string
          details: Json
          external_message_id: string | null
          id: string
          import_job_id: string | null
          new_owner_profile_id: string | null
          occurred_at: string
          opportunity_id: string
          previous_owner_profile_id: string | null
          semester_id: string
          summary: string | null
          supersedes_activity_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "outreach_activities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_inactive_owner_work: {
        Args: { p_owner_profile_id: string }
        Returns: {
          opportunity_id: string
        }[]
      }
      replace_draft_session_dates: {
        Args: { p_dates: Json; p_semester_id: string }
        Returns: number
      }
      set_outreach_silence: {
        Args: {
          p_expected_updated_at?: string
          p_is_silenced: boolean
          p_next_follow_up_at?: string
          p_opportunity_id: string
          p_reason?: string
        }
        Returns: {
          cadence_days: number
          contact_id: string
          conversion_details: Json
          converted_mentor_profile_id: string | null
          converted_startup_semester_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          notes: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          semester_id: string
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_import_job_id: string | null
          stage: Database["public"]["Enums"]["outreach_stage"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "outreach_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_outreach_snooze: {
        Args: {
          p_expected_updated_at?: string
          p_opportunity_id: string
          p_reason?: string
          p_snoozed_until: string
        }
        Returns: {
          cadence_days: number
          contact_id: string
          conversion_details: Json
          converted_mentor_profile_id: string | null
          converted_startup_semester_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          notes: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          semester_id: string
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_import_job_id: string | null
          stage: Database["public"]["Enums"]["outreach_stage"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "outreach_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      suspend_outreach_membership: {
        Args: {
          p_expected_updated_at: string
          p_profile_id: string
          p_reason: string
          p_semester_id: string
        }
        Returns: {
          membership_id: string
          membership_status: Database["public"]["Enums"]["membership_lifecycle_status"]
          membership_updated_at: string
          released_opportunity_ids: string[]
        }[]
      }
      transfer_outreach_owner: {
        Args: {
          p_expected_updated_at?: string
          p_new_owner_profile_id: string
          p_opportunity_id: string
          p_reason?: string
        }
        Returns: {
          cadence_days: number
          contact_id: string
          conversion_details: Json
          converted_mentor_profile_id: string | null
          converted_startup_semester_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          notes: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          semester_id: string
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_import_job_id: string | null
          stage: Database["public"]["Enums"]["outreach_stage"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "outreach_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      access_request_status: "pending" | "approved" | "rejected" | "withdrawn"
      invitation_lifecycle_status:
        | "draft"
        | "queued"
        | "sent"
        | "failed"
        | "accepted"
        | "expired"
        | "revoked"
      membership_lifecycle_status:
        | "invited"
        | "onboarding"
        | "active"
        | "alumni"
        | "suspended"
      outreach_activity_kind:
        | "email"
        | "call"
        | "linkedin"
        | "meeting"
        | "reply"
        | "note"
        | "stage_change"
        | "owner_transfer"
        | "owner_release"
        | "snooze"
        | "silence"
        | "unsilence"
      outreach_channel:
        | "email"
        | "linkedin"
        | "warm_intro"
        | "referral"
        | "event"
        | "other"
      outreach_import_match_decision:
        | "create_new"
        | "exact_email"
        | "exact_linkedin"
        | "review_required"
        | "merge"
        | "exclude"
      outreach_import_status:
        | "preview"
        | "reviewing"
        | "ready"
        | "committing"
        | "committed"
        | "failed"
        | "rolled_back"
      outreach_stage:
        | "prospect"
        | "researching"
        | "ready"
        | "contacted"
        | "responded"
        | "meeting"
        | "nurture"
        | "converted"
        | "closed"
      outreach_status: "prospect" | "contacted" | "responded" | "onboarded"
      platform_role: "super_admin"
      semester_lifecycle_status: "draft" | "active" | "closed" | "archived"
      session_status: "pending" | "confirmed" | "declined"
      startup_stage: "idea" | "mvp" | "growth"
      user_role: "mentor" | "startup" | "admin"
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
    Enums: {
      access_request_status: ["pending", "approved", "rejected", "withdrawn"],
      invitation_lifecycle_status: [
        "draft",
        "queued",
        "sent",
        "failed",
        "accepted",
        "expired",
        "revoked",
      ],
      membership_lifecycle_status: [
        "invited",
        "onboarding",
        "active",
        "alumni",
        "suspended",
      ],
      outreach_activity_kind: [
        "email",
        "call",
        "linkedin",
        "meeting",
        "reply",
        "note",
        "stage_change",
        "owner_transfer",
        "owner_release",
        "snooze",
        "silence",
        "unsilence",
      ],
      outreach_channel: [
        "email",
        "linkedin",
        "warm_intro",
        "referral",
        "event",
        "other",
      ],
      outreach_import_match_decision: [
        "create_new",
        "exact_email",
        "exact_linkedin",
        "review_required",
        "merge",
        "exclude",
      ],
      outreach_import_status: [
        "preview",
        "reviewing",
        "ready",
        "committing",
        "committed",
        "failed",
        "rolled_back",
      ],
      outreach_stage: [
        "prospect",
        "researching",
        "ready",
        "contacted",
        "responded",
        "meeting",
        "nurture",
        "converted",
        "closed",
      ],
      outreach_status: ["prospect", "contacted", "responded", "onboarded"],
      platform_role: ["super_admin"],
      semester_lifecycle_status: ["draft", "active", "closed", "archived"],
      session_status: ["pending", "confirmed", "declined"],
      startup_stage: ["idea", "mvp", "growth"],
      user_role: ["mentor", "startup", "admin"],
    },
  },
} as const
