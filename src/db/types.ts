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
          {
            foreignKeyName: "invitations_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_availability: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          meeting_id: string
          semester_id: string
          semester_membership_id: string
          slot: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          meeting_id: string
          semester_id: string
          semester_membership_id: string
          slot: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          meeting_id?: string
          semester_id?: string
          semester_membership_id?: string
          slot?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_availability_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_availability_semester_id_meeting_id_fkey"
            columns: ["semester_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "meeting_availability_semester_id_meeting_id_fkey"
            columns: ["semester_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "meeting_availability_semester_id_semester_membership_id_fkey"
            columns: ["semester_id", "semester_membership_id"]
            isOneToOne: false
            referencedRelation: "semester_memberships"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          id: string
          label: string | null
          meeting_date: string
          semester_id: string
          slot_1_ends_at: string
          slot_1_starts_at: string
          slot_2_ends_at: string
          slot_2_starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          meeting_date: string
          semester_id: string
          slot_1_ends_at?: string
          slot_1_starts_at?: string
          slot_2_ends_at?: string
          slot_2_starts_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          meeting_date?: string
          semester_id?: string
          slot_1_ends_at?: string
          slot_1_starts_at?: string
          slot_2_ends_at?: string
          slot_2_starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
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
          general_availability: string | null
          id: string
          mentorship_goals: string | null
          opening_talk: string | null
          per_week_availability: Json
          preferred_format: string | null
          readiness_status: string
          semester_id: string
          semester_membership_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          general_availability?: string | null
          id?: string
          mentorship_goals?: string | null
          opening_talk?: string | null
          per_week_availability?: Json
          preferred_format?: string | null
          readiness_status?: string
          semester_id: string
          semester_membership_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          general_availability?: string | null
          id?: string
          mentorship_goals?: string | null
          opening_talk?: string | null
          per_week_availability?: Json
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
      outreach_activities: {
        Row: {
          activity_kind: Database["public"]["Enums"]["outreach_activity_kind"]
          actor_profile_id: string | null
          channel: Database["public"]["Enums"]["outreach_channel"] | null
          created_at: string
          details: Json
          external_message_id: string | null
          id: string
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
          background_notes: string | null
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
          relationship_types: string[]
          updated_at: string
        }
        Insert: {
          background_notes?: string | null
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
          relationship_types?: string[]
          updated_at?: string
        }
        Update: {
          background_notes?: string | null
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
          relationship_types?: string[]
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
      outreach_imports: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          result: Json
          rows: Json
          semester_id: string
          source_name: string
          status: string
          updated_at: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          result?: Json
          rows?: Json
          semester_id: string
          source_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          result?: Json
          rows?: Json
          semester_id?: string
          source_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_imports_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_opportunities: {
        Row: {
          cadence_days: number
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          relationship_types: string[]
          semester_id: string
          semester_notes: string | null
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_context: Json
          stage: string
          updated_at: string
        }
        Insert: {
          cadence_days?: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_silenced?: boolean
          latest_inbound_activity_at?: string | null
          latest_outbound_activity_at?: string | null
          next_follow_up_at?: string | null
          owner_profile_id?: string | null
          priority?: number
          referred_by?: string | null
          relationship_types?: string[]
          semester_id: string
          semester_notes?: string | null
          silence_reason?: string | null
          silenced_at?: string | null
          silenced_by?: string | null
          snoozed_until?: string | null
          source_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          source_context?: Json
          stage?: string
          updated_at?: string
        }
        Update: {
          cadence_days?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_silenced?: boolean
          latest_inbound_activity_at?: string | null
          latest_outbound_activity_at?: string | null
          next_follow_up_at?: string | null
          owner_profile_id?: string | null
          priority?: number
          referred_by?: string | null
          relationship_types?: string[]
          semester_id?: string
          semester_notes?: string | null
          silence_reason?: string | null
          silenced_at?: string | null
          silenced_by?: string | null
          snoozed_until?: string | null
          source_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          source_context?: Json
          stage?: string
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
            foreignKeyName: "outreach_opportunities_silenced_by_fkey"
            columns: ["silenced_by"]
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
          auth_user_id: string | null
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
          auth_user_id?: string | null
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
          auth_user_id?: string | null
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
      program_audit_events: {
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
            foreignKeyName: "program_audit_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_audit_events_semester_id_fkey"
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
          onboarding_completed_at: string | null
          onboarding_data: Json
          onboarding_started_at: string | null
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
          onboarding_completed_at?: string | null
          onboarding_data?: Json
          onboarding_started_at?: string | null
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
          onboarding_completed_at?: string | null
          onboarding_data?: Json
          onboarding_started_at?: string | null
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
      sessions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          format: string | null
          id: string
          idempotency_key: string | null
          is_confirmed: boolean | null
          meeting_id: string
          mentor_id: string | null
          mentor_semester_id: string
          notes: string | null
          requested_at: string
          semester_id: string
          session_date: string | null
          session_date_id: string | null
          slot: number
          startup_absent: boolean
          startup_id: string | null
          startup_semester_id: string
          status: string
          substitute_name: string | null
          time_slot: string | null
          topic: string | null
          updated_at: string
          mentors: {
            bio: string | null
            company: string | null
            created_at: string | null
            email: string | null
            expertise_tags: string[] | null
            full_name: string | null
            general_availability: string | null
            id: string | null
            is_active: boolean | null
            linkedin_url: string | null
            mentorship_goals: string | null
            opening_talk: string | null
            per_week_availability: Json | null
            photo_url: string | null
            preferred_format: string | null
            role_title: string | null
            semester_id: string | null
            slug: string | null
            updated_at: string | null
            user_id: string | null
            website_url: string | null
          } | null
          session_dates: {
            created_at: string | null
            date: string | null
            id: string | null
            label: string | null
            semester_id: string | null
          } | null
          startups: {
            created_at: string | null
            description: string | null
            founder_name: string | null
            founders: Json | null
            id: string | null
            industry: string | null
            is_active: boolean | null
            logo_url: string | null
            mentor_preferences: string | null
            mentorship_needs: string[] | null
            name: string | null
            preferred_tags: string[] | null
            semester_goals: string[] | null
            semester_id: string | null
            slug: string | null
            stage: Database["public"]["Enums"]["startup_stage"] | null
            updated_at: string | null
            user_id: string | null
            website: string | null
          } | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          format?: string | null
          id?: string
          idempotency_key?: string | null
          is_confirmed?: boolean | null
          meeting_id: string
          mentor_id?: string | null
          mentor_semester_id: string
          notes?: string | null
          requested_at?: string
          semester_id: string
          session_date?: string | null
          session_date_id?: string | null
          slot: number
          startup_absent?: boolean
          startup_id?: string | null
          startup_semester_id: string
          status?: string
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
          idempotency_key?: string | null
          is_confirmed?: boolean | null
          meeting_id?: string
          mentor_id?: string | null
          mentor_semester_id?: string
          notes?: string | null
          requested_at?: string
          semester_id?: string
          session_date?: string | null
          session_date_id?: string | null
          slot?: number
          startup_absent?: boolean
          startup_id?: string | null
          startup_semester_id?: string
          status?: string
          substitute_name?: string | null
          time_slot?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_semester_meeting_fkey"
            columns: ["semester_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "sessions_semester_meeting_fkey"
            columns: ["semester_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "sessions_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentor_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "sessions_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "sessions_semester_startup_fkey"
            columns: ["semester_id", "startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "sessions_semester_startup_fkey"
            columns: ["semester_id", "startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      startup_organizations: {
        Row: {
          created_at: string
          description: string | null
          durable_contact_data: Json
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
          durable_contact_data?: Json
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
          durable_contact_data?: Json
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
          {
            foreignKeyName: "startup_team_memberships_startup_semester_id_fkey"
            columns: ["startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startups"
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
      availability: {
        Row: {
          created_at: string | null
          id: string | null
          is_available: boolean | null
          session_date_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semester_memberships_profile_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors: {
        Row: {
          bio: string | null
          company: string | null
          created_at: string | null
          email: string | null
          expertise_tags: string[] | null
          full_name: string | null
          general_availability: string | null
          id: string | null
          is_active: boolean | null
          linkedin_url: string | null
          mentorship_goals: string | null
          opening_talk: string | null
          per_week_availability: Json | null
          photo_url: string | null
          preferred_format: string | null
          role_title: string | null
          semester_id: string | null
          slug: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
          semesters: {
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
          } | null
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
            foreignKeyName: "semester_memberships_profile_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_dates: {
        Row: {
          created_at: string | null
          date: string | null
          id: string | null
          label: string | null
          semester_id: string | null
          semesters: {
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
          } | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          id?: string | null
          label?: string | null
          semester_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          id?: string | null
          label?: string | null
          semester_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          created_at: string | null
          description: string | null
          founder_name: string | null
          founders: Json | null
          id: string | null
          industry: string | null
          is_active: boolean | null
          logo_url: string | null
          mentor_preferences: string | null
          mentorship_needs: string[] | null
          name: string | null
          preferred_tags: string[] | null
          semester_goals: string[] | null
          semester_id: string | null
          slug: string | null
          stage: Database["public"]["Enums"]["startup_stage"] | null
          updated_at: string | null
          user_id: string | null
          website: string | null
          semesters: {
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
          } | null
        }
        Relationships: [
          {
            foreignKeyName: "semester_memberships_profile_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_semesters_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
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
      carry_forward_outreach_contacts: {
        Args: {
          p_contact_ids: string[]
          p_source_semester_id: string
          p_target_semester_id: string
        }
        Returns: number
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
      create_mentor_records: {
        Args: {
          p_actor_profile_id: string
          p_biography: string
          p_company: string
          p_email: string
          p_expertise_tags: string[]
          p_general_availability: string
          p_is_active: boolean
          p_linkedin_url: string
          p_opening_talk: string
          p_preferred_format: string
          p_profile_id: string
          p_semester_id: string
          p_title: string
        }
        Returns: string
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
      mentors: {
        Args: { "": Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: {
          bio: string | null
          company: string | null
          created_at: string | null
          email: string | null
          expertise_tags: string[] | null
          full_name: string | null
          general_availability: string | null
          id: string | null
          is_active: boolean | null
          linkedin_url: string | null
          mentorship_goals: string | null
          opening_talk: string | null
          per_week_availability: Json | null
          photo_url: string | null
          preferred_format: string | null
          role_title: string | null
          semester_id: string | null
          slug: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
        }
        SetofOptions: {
          from: "sessions"
          to: "mentors"
          isOneToOne: true
          isSetofReturn: true
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
      reset_outreach_opportunities: {
        Args: { p_opportunity_ids: string[]; p_semester_id: string }
        Returns: number
      }
      semesters:
        | {
            Args: { "": Database["public"]["Views"]["mentors"]["Row"] }
            Returns: {
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
            SetofOptions: {
              from: "mentors"
              to: "semesters"
              isOneToOne: true
              isSetofReturn: true
            }
          }
        | {
            Args: { "": Database["public"]["Views"]["session_dates"]["Row"] }
            Returns: {
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
            SetofOptions: {
              from: "session_dates"
              to: "semesters"
              isOneToOne: true
              isSetofReturn: true
            }
          }
        | {
            Args: { "": Database["public"]["Views"]["startups"]["Row"] }
            Returns: {
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
            SetofOptions: {
              from: "startups"
              to: "semesters"
              isOneToOne: true
              isSetofReturn: true
            }
          }
      session_dates: {
        Args: { "": Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: {
          created_at: string | null
          date: string | null
          id: string | null
          label: string | null
          semester_id: string | null
        }
        SetofOptions: {
          from: "sessions"
          to: "session_dates"
          isOneToOne: true
          isSetofReturn: true
        }
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
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          relationship_types: string[]
          semester_id: string
          semester_notes: string | null
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_context: Json
          stage: string
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
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          relationship_types: string[]
          semester_id: string
          semester_notes: string | null
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_context: Json
          stage: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "outreach_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      startups: {
        Args: { "": Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: {
          created_at: string | null
          description: string | null
          founder_name: string | null
          founders: Json | null
          id: string | null
          industry: string | null
          is_active: boolean | null
          logo_url: string | null
          mentor_preferences: string | null
          mentorship_needs: string[] | null
          name: string | null
          preferred_tags: string[] | null
          semester_goals: string[] | null
          semester_id: string | null
          slug: string | null
          stage: Database["public"]["Enums"]["startup_stage"] | null
          updated_at: string | null
          user_id: string | null
          website: string | null
        }
        SetofOptions: {
          from: "sessions"
          to: "startups"
          isOneToOne: true
          isSetofReturn: true
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
          created_at: string
          created_by: string | null
          id: string
          is_silenced: boolean
          latest_inbound_activity_at: string | null
          latest_outbound_activity_at: string | null
          next_follow_up_at: string | null
          owner_profile_id: string | null
          priority: number
          referred_by: string | null
          relationship_types: string[]
          semester_id: string
          semester_notes: string | null
          silence_reason: string | null
          silenced_at: string | null
          silenced_by: string | null
          snoozed_until: string | null
          source_channel: Database["public"]["Enums"]["outreach_channel"] | null
          source_context: Json
          stage: string
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
        | "not_contacted"
        | "replied"
        | "conversation_scheduled"
        | "declined"
      outreach_status: "prospect" | "contacted" | "responded" | "onboarded"
      platform_role: "super_admin"
      semester_lifecycle_status: "draft" | "active" | "closed" | "archived"
      session_status:
        | "pending"
        | "confirmed"
        | "declined"
        | "requested"
        | "cancelled"
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
        "not_contacted",
        "replied",
        "conversation_scheduled",
        "declined",
      ],
      outreach_status: ["prospect", "contacted", "responded", "onboarded"],
      platform_role: ["super_admin"],
      semester_lifecycle_status: ["draft", "active", "closed", "archived"],
      session_status: [
        "pending",
        "confirmed",
        "declined",
        "requested",
        "cancelled",
      ],
      startup_stage: ["idea", "mvp", "growth"],
      user_role: ["mentor", "startup", "admin"],
    },
  },
} as const

