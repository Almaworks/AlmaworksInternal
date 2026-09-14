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
      expertise_tag_aliases: {
        Row: {
          created_at: string
          expertise_tag_id: string
          id: string
          normalized_alias: string
        }
        Insert: {
          created_at?: string
          expertise_tag_id: string
          id?: string
          normalized_alias: string
        }
        Update: {
          created_at?: string
          expertise_tag_id?: string
          id?: string
          normalized_alias?: string
        }
        Relationships: [
          {
            foreignKeyName: "expertise_tag_aliases_expertise_tag_id_fkey"
            columns: ["expertise_tag_id"]
            isOneToOne: false
            referencedRelation: "expertise_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      expertise_tags: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          id: string
          name: string
          normalized_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          name: string
          normalized_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          name?: string
          normalized_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expertise_tags_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friday_program_assignments: {
        Row: {
          created_at: string
          group_code: string
          group_position: number
          id: string
          program_id: string
          semester_id: string
          startup_name: string
          startup_organization_id: string
          startup_semester_id: string
          startup_slug: string
        }
        Insert: {
          created_at?: string
          group_code: string
          group_position: number
          id?: string
          program_id: string
          semester_id: string
          startup_name: string
          startup_organization_id: string
          startup_semester_id: string
          startup_slug: string
        }
        Update: {
          created_at?: string
          group_code?: string
          group_position?: number
          id?: string
          program_id?: string
          semester_id?: string
          startup_name?: string
          startup_organization_id?: string
          startup_semester_id?: string
          startup_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "friday_program_assignments_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_program_assignments_semester_id_program_id_fkey"
            columns: ["semester_id", "program_id"]
            isOneToOne: false
            referencedRelation: "friday_programs"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "friday_program_assignments_semester_id_startup_semester_id_fkey"
            columns: ["semester_id", "startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "friday_program_assignments_startup_organization_id_fkey"
            columns: ["startup_organization_id"]
            isOneToOne: false
            referencedRelation: "startup_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      friday_programs: {
        Row: {
          agenda_version: number
          generated_at: string
          generated_by_profile_id: string
          group_a_facilitator: string
          group_b_facilitator: string
          id: string
          meeting_id: string
          semester_id: string
          startup_count: number
        }
        Insert: {
          agenda_version?: number
          generated_at?: string
          generated_by_profile_id: string
          group_a_facilitator?: string
          group_b_facilitator?: string
          id?: string
          meeting_id: string
          semester_id: string
          startup_count: number
        }
        Update: {
          agenda_version?: number
          generated_at?: string
          generated_by_profile_id?: string
          group_a_facilitator?: string
          group_b_facilitator?: string
          id?: string
          meeting_id?: string
          semester_id?: string
          startup_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "friday_programs_generated_by_profile_id_fkey"
            columns: ["generated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_programs_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_programs_semester_id_meeting_id_fkey"
            columns: ["semester_id", "meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["semester_id", "id"]
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
      meeting_availability: {
        Row: {
          created_at: string
          format: string | null
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
          format?: string | null
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
          format?: string | null
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
      mentor_booking_accepted_occupancy: {
        Row: {
          ends_at: string
          mentor_semester_id: string
          request_id: string
          semester_id: string
          starts_at: string
        }
        Insert: {
          ends_at: string
          mentor_semester_id: string
          request_id: string
          semester_id: string
          starts_at: string
        }
        Update: {
          ends_at?: string
          mentor_semester_id?: string
          request_id?: string
          semester_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_booking_accepted_occupancy_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "mentor_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_accepted_occupancy_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_accepted_occupancy_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentor_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "mentor_booking_accepted_occupancy_semester_request_fkey"
            columns: ["semester_id", "request_id"]
            isOneToOne: false
            referencedRelation: "mentor_booking_requests"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      mentor_booking_requests: {
        Row: {
          cancelled_at: string | null
          ends_at: string
          id: string
          mentor_name: string
          mentor_profile_id: string
          mentor_semester_id: string
          requested_at: string
          requested_by_profile_id: string
          responded_at: string | null
          semester_id: string
          starts_at: string
          startup_name: string
          startup_organization_id: string
          startup_semester_id: string
          status: string
          topic: string
          updated_at: string
          window_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          ends_at: string
          id?: string
          mentor_name: string
          mentor_profile_id: string
          mentor_semester_id: string
          requested_at?: string
          requested_by_profile_id: string
          responded_at?: string | null
          semester_id: string
          starts_at: string
          startup_name: string
          startup_organization_id: string
          startup_semester_id: string
          status?: string
          topic: string
          updated_at?: string
          window_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          ends_at?: string
          id?: string
          mentor_name?: string
          mentor_profile_id?: string
          mentor_semester_id?: string
          requested_at?: string
          requested_by_profile_id?: string
          responded_at?: string | null
          semester_id?: string
          starts_at?: string
          startup_name?: string
          startup_organization_id?: string
          startup_semester_id?: string
          status?: string
          topic?: string
          updated_at?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_booking_requests_mentor_profile_id_fkey"
            columns: ["mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_requests_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_requests_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_requests_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentor_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "mentor_booking_requests_semester_startup_fkey"
            columns: ["semester_id", "startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "mentor_booking_requests_startup_organization_id_fkey"
            columns: ["startup_organization_id"]
            isOneToOne: false
            referencedRelation: "startup_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_booking_windows: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          mentor_name: string
          mentor_profile_id: string
          mentor_semester_id: string
          semester_id: string
          starts_at: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          mentor_name: string
          mentor_profile_id: string
          mentor_semester_id: string
          semester_id: string
          starts_at: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          mentor_name?: string
          mentor_profile_id?: string
          mentor_semester_id?: string
          semester_id?: string
          starts_at?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_booking_windows_mentor_profile_id_fkey"
            columns: ["mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_windows_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_booking_windows_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentor_semesters"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      mentor_expertise_tags: {
        Row: {
          created_at: string
          expertise_tag_id: string
          mentor_profile_id: string
        }
        Insert: {
          created_at?: string
          expertise_tag_id: string
          mentor_profile_id: string
        }
        Update: {
          created_at?: string
          expertise_tag_id?: string
          mentor_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_expertise_tags_expertise_tag_id_fkey"
            columns: ["expertise_tag_id"]
            isOneToOne: false
            referencedRelation: "expertise_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_expertise_tags_mentor_profile_id_fkey"
            columns: ["mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "mentor_profiles"
            referencedColumns: ["profile_id"]
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
      mentor_weekly_availability: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          mentor_semester_id: string
          semester_id: string
          starts_at: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          mentor_semester_id: string
          semester_id: string
          starts_at: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          mentor_semester_id?: string
          semester_id?: string
          starts_at?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "mentor_weekly_availability_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_weekly_availability_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentor_semesters"
            referencedColumns: ["semester_id", "id"]
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
          archived_at: string | null
          archived_by: string | null
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
          archived_at?: string | null
          archived_by?: string | null
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
          archived_at?: string | null
          archived_by?: string | null
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
            foreignKeyName: "outreach_contacts_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_email_messages: {
        Row: {
          body: string
          client_idempotency_key: string
          contact_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_expires_at: string
          opportunity_id: string
          recipient_email: string
          recipient_name: string
          request_digest: string
          scheduled_at: string | null
          semester_id: string
          sender: string
          snapshot_digest: string
          snapshot_key_id: string
          snapshot_signature: string
          snapshot_version: number
          subject: string
          template_id: string | null
        }
        Insert: {
          body: string
          client_idempotency_key: string
          contact_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_expires_at: string
          opportunity_id: string
          recipient_email: string
          recipient_name: string
          request_digest: string
          scheduled_at?: string | null
          semester_id: string
          sender: string
          snapshot_digest: string
          snapshot_key_id: string
          snapshot_signature: string
          snapshot_version: number
          subject: string
          template_id?: string | null
        }
        Update: {
          body?: string
          client_idempotency_key?: string
          contact_id?: string
          created_at?: string
          created_by?: string
          id?: string
          idempotency_expires_at?: string
          opportunity_id?: string
          recipient_email?: string
          recipient_name?: string
          request_digest?: string
          scheduled_at?: string | null
          semester_id?: string
          sender?: string
          snapshot_digest?: string
          snapshot_key_id?: string
          snapshot_signature?: string
          snapshot_version?: number
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_email_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_email_messages_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_email_messages_semester_opportunity_fkey"
            columns: ["semester_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "outreach_opportunities"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "outreach_email_messages_semester_template_fkey"
            columns: ["semester_id", "template_id"]
            isOneToOne: false
            referencedRelation: "outreach_email_templates"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      outreach_email_receipts: {
        Row: {
          checked_at: string
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          message_id: string
          message_status: string
          provider_id: string | null
          provider_status: string
          receipt_digest: string
          receipt_key_id: string
          receipt_signature: string
          receipt_version: number
          semester_id: string
          sent_at: string | null
          sequence: number
          snapshot_digest: string
        }
        Insert: {
          checked_at: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          message_id: string
          message_status: string
          provider_id?: string | null
          provider_status: string
          receipt_digest: string
          receipt_key_id: string
          receipt_signature: string
          receipt_version: number
          semester_id: string
          sent_at?: string | null
          sequence?: number
          snapshot_digest: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          message_id?: string
          message_status?: string
          provider_id?: string | null
          provider_status?: string
          receipt_digest?: string
          receipt_key_id?: string
          receipt_signature?: string
          receipt_version?: number
          semester_id?: string
          sent_at?: string | null
          sequence?: number
          snapshot_digest?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_receipts_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_email_receipts_semester_message_fkey"
            columns: ["semester_id", "message_id"]
            isOneToOne: false
            referencedRelation: "outreach_email_messages"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      outreach_email_templates: {
        Row: {
          archived_at: string | null
          body_template: string
          created_at: string
          created_by: string
          id: string
          name: string
          semester_id: string
          subject_template: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body_template: string
          created_at?: string
          created_by?: string
          id?: string
          name: string
          semester_id: string
          subject_template: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body_template?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          semester_id?: string
          subject_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_email_templates_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
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
          archived_at: string | null
          archived_by: string | null
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
          archived_at?: string | null
          archived_by?: string | null
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
          archived_at?: string | null
          archived_by?: string | null
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
            foreignKeyName: "outreach_opportunities_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      participant_notification_reads: {
        Row: {
          notification_key: string
          profile_id: string
          read_at: string
          semester_id: string
        }
        Insert: {
          notification_key: string
          profile_id: string
          read_at?: string
          semester_id: string
        }
        Update: {
          notification_key?: string
          profile_id?: string
          read_at?: string
          semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_notification_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_notification_reads_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
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
          photo_path: string | null
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
          photo_path?: string | null
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
          photo_path?: string | null
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
      session_rsvps: {
        Row: {
          created_at: string
          id: string
          responded_at: string
          response: string
          semester_id: string
          semester_membership_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          responded_at?: string
          response: string
          semester_id: string
          semester_membership_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          responded_at?: string
          response?: string
          semester_id?: string
          semester_membership_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_rsvps_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_rsvps_semester_membership_fkey"
            columns: ["semester_id", "semester_membership_id"]
            isOneToOne: false
            referencedRelation: "semester_memberships"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "session_rsvps_semester_session_fkey"
            columns: ["semester_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      sessions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          format: string | null
          id: string
          idempotency_key: string | null
          meeting_id: string
          mentor_semester_id: string
          notes: string | null
          requested_at: string
          semester_id: string
          slot: number
          startup_absent: boolean
          startup_semester_id: string
          status: string
          substitute_name: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          format?: string | null
          id?: string
          idempotency_key?: string | null
          meeting_id: string
          mentor_semester_id: string
          notes?: string | null
          requested_at?: string
          semester_id: string
          slot: number
          startup_absent?: boolean
          startup_semester_id: string
          status?: string
          substitute_name?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          format?: string | null
          id?: string
          idempotency_key?: string | null
          meeting_id?: string
          mentor_semester_id?: string
          notes?: string | null
          requested_at?: string
          semester_id?: string
          slot?: number
          startup_absent?: boolean
          startup_semester_id?: string
          status?: string
          substitute_name?: string | null
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
            foreignKeyName: "sessions_semester_mentor_fkey"
            columns: ["semester_id", "mentor_semester_id"]
            isOneToOne: false
            referencedRelation: "mentor_semesters"
            referencedColumns: ["semester_id", "id"]
          },
          {
            foreignKeyName: "sessions_semester_startup_fkey"
            columns: ["semester_id", "startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
            referencedColumns: ["semester_id", "id"]
          },
        ]
      }
      startup_mentor_need_tags: {
        Row: {
          created_at: string
          expertise_tag_id: string
          priority: number
          semester_id: string
          startup_semester_id: string
        }
        Insert: {
          created_at?: string
          expertise_tag_id: string
          priority: number
          semester_id: string
          startup_semester_id: string
        }
        Update: {
          created_at?: string
          expertise_tag_id?: string
          priority?: number
          semester_id?: string
          startup_semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_mentor_need_tags_expertise_tag_id_fkey"
            columns: ["expertise_tag_id"]
            isOneToOne: false
            referencedRelation: "expertise_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_mentor_need_tags_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_mentor_need_tags_semester_id_startup_semester_id_fkey"
            columns: ["semester_id", "startup_semester_id"]
            isOneToOne: false
            referencedRelation: "startup_semesters"
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
      attach_replacement_auth_identity: {
        Args: { p_auth_user_id: string; p_profile_id: string }
        Returns: {
          auth_user_id: string
          profile_id: string
          profile_is_active: boolean
        }[]
      }
      authorize_semester_member_identity_update: {
        Args: { p_profile_id: string; p_semester_id: string }
        Returns: string
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
      cancel_mentor_booking_request: {
        Args: { p_request_id: string; p_semester_id: string }
        Returns: string
      }
      carry_forward_outreach_contacts: {
        Args: {
          p_contact_ids: string[]
          p_source_semester_id: string
          p_target_semester_id: string
        }
        Returns: number
      }
      commit_mentor_assignment: {
        Args: {
          p_format?: string
          p_idempotency_key: string
          p_meeting_id: string
          p_mentor_semester_id: string
          p_override_reason?: string
          p_override_types?: string[]
          p_ranking_context?: Json
          p_semester_id: string
          p_slot: number
          p_startup_semester_id: string
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
      delete_startup_permanently: {
        Args: { p_confirmation_name: string; p_startup_organization_id: string }
        Returns: Json
      }
      discard_replacement_auth_placeholder: {
        Args: { p_auth_user_id: string; p_profile_id: string }
        Returns: {
          auth_user_id: string
          placeholder_discarded: boolean
          profile_id: string
        }[]
      }
      generate_friday_program: {
        Args: {
          p_meeting_id: string
          p_regenerate?: boolean
          p_semester_id: string
        }
        Returns: {
          assignment_count: number
          generated_at: string
          program_id: string
          was_created: boolean
        }[]
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
      move_startup_team_membership: {
        Args: {
          p_from_startup_semester_id: string
          p_profile_id: string
          p_to_startup_semester_id: string
        }
        Returns: string
      }
      prepare_member_login_removal: {
        Args: { p_profile_id: string; p_reason: string }
        Returns: {
          auth_user_id: string
          profile_id: string
          profile_is_active: boolean
          suspended_membership_ids: string[]
        }[]
      }
      preview_member_login_removal: {
        Args: { p_profile_id: string }
        Returns: {
          already_prepared: boolean
          auth_user_id: string
          email: string
          full_name: string
          profile_id: string
          profile_is_active: boolean
          semester_count: number
          session_count: number
          suspend_membership_ids: string[]
        }[]
      }
      publish_mentor_booking_window: {
        Args: { p_ends_at: string; p_semester_id: string; p_starts_at: string }
        Returns: string
      }
      release_inactive_owner_work: {
        Args: { p_owner_profile_id: string }
        Returns: {
          opportunity_id: string
        }[]
      }
      replace_draft_meetings: {
        Args: { p_meetings: Json; p_semester_id: string }
        Returns: number
      }
      replace_mentor_weekly_availability: {
        Args: { p_availability: Json; p_semester_id: string }
        Returns: undefined
      }
      request_mentor_booking: {
        Args: {
          p_ends_at: string
          p_mentor_semester_id: string
          p_semester_id: string
          p_starts_at: string
          p_topic: string
        }
        Returns: string
      }
      request_mentor_booking_window: {
        Args: { p_semester_id: string; p_topic: string; p_window_id: string }
        Returns: string
      }
      reserve_outreach_email_message: {
        Args: {
          p_body: string
          p_client_idempotency_key: string
          p_contact_id: string
          p_created_at: string
          p_id: string
          p_idempotency_expires_at: string
          p_opportunity_id: string
          p_recipient_email: string
          p_recipient_name: string
          p_request_digest: string
          p_scheduled_at?: string
          p_semester_id: string
          p_sender: string
          p_snapshot_digest: string
          p_snapshot_key_id: string
          p_snapshot_signature: string
          p_snapshot_version: number
          p_subject: string
          p_template_id?: string
        }
        Returns: {
          body: string
          client_idempotency_key: string
          contact_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_expires_at: string
          opportunity_id: string
          recipient_email: string
          recipient_name: string
          request_digest: string
          scheduled_at: string | null
          semester_id: string
          sender: string
          snapshot_digest: string
          snapshot_key_id: string
          snapshot_signature: string
          snapshot_version: number
          subject: string
          template_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "outreach_email_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reset_outreach_opportunities: {
        Args: { p_opportunity_ids: string[]; p_semester_id: string }
        Returns: number
      }
      respond_to_mentor_booking_request: {
        Args: {
          p_request_id: string
          p_response: string
          p_semester_id: string
        }
        Returns: string
      }
      set_mentor_account_access: {
        Args: { p_enabled: boolean; p_mentor_semester_id: string }
        Returns: {
          auth_user_id: string
          profile_id: string
          profile_is_active: boolean
          suspended_membership_ids: string[]
        }[]
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
          archived_at: string | null
          archived_by: string | null
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
          archived_at: string | null
          archived_by: string | null
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
      set_platform_super_admin: {
        Args: { p_enabled: boolean; p_profile_id: string }
        Returns: undefined
      }
      set_semester_member_access: {
        Args: {
          p_actor_profile_id: string
          p_approve: boolean
          p_email: string
          p_full_name: string
          p_profile_id: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_semester_id: string
        }
        Returns: string
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
          archived_at: string | null
          archived_by: string | null
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
      update_mentor_records: {
        Args: {
          p_actor_profile_id: string
          p_mentor_semester_id: string
          p_patch: Json
        }
        Returns: string
      }
      update_own_onboarding_progress: {
        Args: {
          p_finalize: boolean
          p_membership_id: string
          p_onboarding_data: Json
          p_semester_id: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "semester_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_startup_records: {
        Args: {
          p_description: string
          p_industry: string
          p_mentorship_needs: string[]
          p_name: string
          p_preferred_expertise_tags: string[]
          p_slug: string
          p_stage: string
          p_startup_semester_id: string
        }
        Returns: string
      }
      upsert_outreach_contact_bundle: {
        Args: {
          p_biography?: string
          p_company_domain?: string
          p_company_id?: string
          p_company_name?: string
          p_company_normalized_name?: string
          p_company_title?: string
          p_contact_id?: string
          p_email?: string
          p_full_name?: string
          p_linkedin_url?: string
          p_owner_profile_id?: string
          p_phone?: string
          p_relationship_types?: string[]
          p_semester_id: string
          p_source_context?: Json
          p_stage?: string
        }
        Returns: {
          company_id: string
          contact_id: string
          opportunity_id: string
        }[]
      }
      withdraw_mentor_booking_window: {
        Args: { p_semester_id: string; p_window_id: string }
        Returns: string
      }
    }
    Enums: {
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
      platform_role: "super_admin"
      semester_lifecycle_status: "draft" | "active" | "closed" | "archived"
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
      platform_role: ["super_admin"],
      semester_lifecycle_status: ["draft", "active", "closed", "archived"],
      startup_stage: ["idea", "mvp", "growth"],
      user_role: ["mentor", "startup", "admin"],
    },
  },
} as const
