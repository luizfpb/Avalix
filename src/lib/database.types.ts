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
      anamneses: {
        Row: {
          assessed_at: string
          created_at: string
          evaluator_id: string
          flag_encaminhamento: boolean
          id: string
          liberado: boolean
          nivel_encaminhamento: string
          org_id: string
          payload: Json
          spec_version: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          assessed_at?: string
          created_at?: string
          evaluator_id?: string
          flag_encaminhamento: boolean
          id?: string
          liberado: boolean
          nivel_encaminhamento: string
          org_id: string
          payload: Json
          spec_version: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          assessed_at?: string
          created_at?: string
          evaluator_id?: string
          flag_encaminhamento?: boolean
          id?: string
          liberado?: boolean
          nivel_encaminhamento?: string
          org_id?: string
          payload?: Json
          spec_version?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamneses_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamneses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamneses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessed_at: string
          created_at: string
          engine_version: string | null
          evaluator_id: string
          height_cm: number
          id: string
          medications: string | null
          notes: string | null
          org_id: string
          protocol_id: string | null
          results: Json | null
          subject_id: string
          updated_at: string
          weight_kg: number
        }
        Insert: {
          assessed_at?: string
          created_at?: string
          engine_version?: string | null
          evaluator_id?: string
          height_cm: number
          id?: string
          medications?: string | null
          notes?: string | null
          org_id: string
          protocol_id?: string | null
          results?: Json | null
          subject_id: string
          updated_at?: string
          weight_kg: number
        }
        Update: {
          assessed_at?: string
          created_at?: string
          engine_version?: string | null
          evaluator_id?: string
          height_cm?: number
          id?: string
          medications?: string | null
          notes?: string | null
          org_id?: string
          protocol_id?: string | null
          results?: Json | null
          subject_id?: string
          updated_at?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          at: string
          id: number
          org_id: string | null
          row_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          id?: never
          org_id?: string | null
          row_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          id?: never
          org_id?: string | null
          row_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      circumference_readings: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          is_custom: boolean
          org_id: string
          site: string
          value_cm: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          is_custom?: boolean
          org_id: string
          site: string
          value_cm: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          is_custom?: boolean
          org_id?: string
          site?: string
          value_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "circumference_readings_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circumference_readings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          collected_by: string
          consent_text_sha256: string
          consent_version: string
          granted_at: string
          id: string
          org_id: string
          revoked_at: string | null
          signer_kind: string
          signer_name: string
          subject_id: string
          user_agent: string | null
        }
        Insert: {
          collected_by: string
          consent_text_sha256: string
          consent_version: string
          granted_at?: string
          id?: string
          org_id: string
          revoked_at?: string | null
          signer_kind: string
          signer_name: string
          subject_id: string
          user_agent?: string | null
        }
        Update: {
          collected_by?: string
          consent_text_sha256?: string
          consent_version?: string
          granted_at?: string
          id?: string
          org_id?: string
          revoked_at?: string | null
          signer_kind?: string
          signer_name?: string
          subject_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          created_by: string | null
          cues: string | null
          equipment: string
          id: string
          is_unilateral: boolean
          movement_pattern: string
          name: string
          org_id: string | null
          primary_muscle: string
          secondary_muscles: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cues?: string | null
          equipment: string
          id?: string
          is_unilateral?: boolean
          movement_pattern: string
          name: string
          org_id?: string | null
          primary_muscle: string
          secondary_muscles?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cues?: string | null
          equipment?: string
          id?: string
          is_unilateral?: boolean
          movement_pattern?: string
          name?: string
          org_id?: string | null
          primary_muscle?: string
          secondary_muscles?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          current_period_end: string | null
          org_id: string
          plan_id: string
          status: string
        }
        Insert: {
          current_period_end?: string | null
          org_id: string
          plan_id: string
          status?: string
        }
        Update: {
          current_period_end?: string | null
          org_id?: string
          plan_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          evaluators_see_all: boolean
          id: string
          logo_path: string | null
          name: string
          subject_term: string
        }
        Insert: {
          created_at?: string
          evaluators_see_all?: boolean
          id?: string
          logo_path?: string | null
          name: string
          subject_term?: string
        }
        Update: {
          created_at?: string
          evaluators_see_all?: boolean
          id?: string
          logo_path?: string | null
          name?: string
          subject_term?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          max_subjects: number | null
          monthly_price_brl: number | null
          name: string
        }
        Insert: {
          id: string
          max_subjects?: number | null
          monthly_price_brl?: number | null
          name: string
        }
        Update: {
          id?: string
          max_subjects?: number | null
          monthly_price_brl?: number | null
          name?: string
        }
        Relationships: []
      }
      posture_annotations: {
        Row: {
          created_at: string
          id: string
          org_id: string
          payload: Json
          photo_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          payload: Json
          photo_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          payload?: Json
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posture_annotations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posture_annotations_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "posture_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      posture_photos: {
        Row: {
          category: string
          created_at: string
          custom_label: string | null
          format: string
          height: number | null
          id: string
          org_id: string
          session_id: string
          size_bytes: number | null
          storage_path: string
          thumb_path: string
          width: number | null
        }
        Insert: {
          category: string
          created_at?: string
          custom_label?: string | null
          format?: string
          height?: number | null
          id?: string
          org_id: string
          session_id: string
          size_bytes?: number | null
          storage_path: string
          thumb_path: string
          width?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          custom_label?: string | null
          format?: string
          height?: number | null
          id?: string
          org_id?: string
          session_id?: string
          size_bytes?: number | null
          storage_path?: string
          thumb_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posture_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posture_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "posture_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      posture_sessions: {
        Row: {
          created_at: string
          evaluator_id: string
          id: string
          notes: string | null
          org_id: string
          subject_id: string
          taken_at: string
        }
        Insert: {
          created_at?: string
          evaluator_id?: string
          id?: string
          notes?: string | null
          org_id: string
          subject_id: string
          taken_at?: string
        }
        Update: {
          created_at?: string
          evaluator_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          subject_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posture_sessions_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posture_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posture_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      skinfold_readings: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          notes: string | null
          org_id: string
          reading_1: number
          reading_2: number | null
          reading_3: number | null
          site: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          reading_1: number
          reading_2?: number | null
          reading_3?: number | null
          site: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          reading_1?: number
          reading_2?: number | null
          reading_3?: number | null
          site?: string
        }
        Relationships: [
          {
            foreignKeyName: "skinfold_readings_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skinfold_readings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          birth_date: string
          created_at: string
          email: string | null
          evaluator_id: string
          full_name: string
          guardian_name: string | null
          guardian_relationship: string | null
          height_cm: number | null
          id: string
          is_active: boolean
          notes: string | null
          org_id: string
          phone: string | null
          sex: string
          updated_at: string
        }
        Insert: {
          birth_date: string
          created_at?: string
          email?: string | null
          evaluator_id?: string
          full_name: string
          guardian_name?: string | null
          guardian_relationship?: string | null
          height_cm?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id: string
          phone?: string | null
          sex: string
          updated_at?: string
        }
        Update: {
          birth_date?: string
          created_at?: string
          email?: string | null
          evaluator_id?: string
          full_name?: string
          guardian_name?: string | null
          guardian_relationship?: string | null
          height_cm?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          phone?: string | null
          sex?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_days: {
        Row: {
          created_at: string
          id: string
          label: string
          name: string | null
          org_id: string
          plan_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          name?: string | null
          org_id: string
          plan_id: string
          position: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          name?: string | null
          org_id?: string
          plan_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          created_at: string
          day_id: string
          exercise_id: string
          id: string
          notes: string | null
          org_id: string
          position: number
          reps: string
          rest_seconds: number | null
          rir: number | null
          sets: number
          tempo: string | null
        }
        Insert: {
          created_at?: string
          day_id: string
          exercise_id: string
          id?: string
          notes?: string | null
          org_id: string
          position: number
          reps: string
          rest_seconds?: number | null
          rir?: number | null
          sets: number
          tempo?: string | null
        }
        Update: {
          created_at?: string
          day_id?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          position?: number
          reps?: string
          rest_seconds?: number | null
          rir?: number | null
          sets?: number
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "workout_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          created_at: string
          evaluator_id: string
          goal: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          source_assessment_id: string | null
          source_posture_session_id: string | null
          starts_on: string | null
          status: string
          subject_id: string
          updated_at: string
          volume: Json | null
          volume_engine_version: string | null
          weeks: number
        }
        Insert: {
          created_at?: string
          evaluator_id?: string
          goal?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          source_assessment_id?: string | null
          source_posture_session_id?: string | null
          starts_on?: string | null
          status?: string
          subject_id: string
          updated_at?: string
          volume?: Json | null
          volume_engine_version?: string | null
          weeks?: number
        }
        Update: {
          created_at?: string
          evaluator_id?: string
          goal?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          source_assessment_id?: string | null
          source_posture_session_id?: string | null
          starts_on?: string | null
          status?: string
          subject_id?: string
          updated_at?: string
          volume?: Json | null
          volume_engine_version?: string | null
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_source_assessment_id_fkey"
            columns: ["source_assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_source_posture_session_id_fkey"
            columns: ["source_posture_session_id"]
            isOneToOne: false
            referencedRelation: "posture_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_week_overrides: {
        Row: {
          created_at: string
          id: string
          is_skipped: boolean
          notes: string | null
          org_id: string
          plan_id: string
          reps: string | null
          rest_seconds: number | null
          rir: number | null
          sets: number | null
          week_number: number
          workout_exercise_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_skipped?: boolean
          notes?: string | null
          org_id: string
          plan_id: string
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          sets?: number | null
          week_number: number
          workout_exercise_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_skipped?: boolean
          notes?: string | null
          org_id?: string
          plan_id?: string
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          sets?: number | null
          week_number?: number
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_week_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_week_overrides_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_week_overrides_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_weeks: {
        Row: {
          created_at: string
          id: string
          is_deload: boolean
          label: string | null
          notes: string | null
          org_id: string
          plan_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_deload?: boolean
          label?: string | null
          notes?: string | null
          org_id: string
          plan_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          is_deload?: boolean
          label?: string | null
          notes?: string | null
          org_id?: string
          plan_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_weeks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_weeks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: { Args: { p_name: string }; Returns: string }
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
