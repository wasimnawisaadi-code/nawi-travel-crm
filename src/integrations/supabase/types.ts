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
      attendance: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          login_time: string | null
          logout_time: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          work_summary: string | null
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          login_time?: string | null
          logout_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          work_summary?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          login_time?: string | null
          logout_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          work_summary?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          target_id: string | null
          target_type: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_type: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_type?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      chat_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          members: string[] | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          members?: string[] | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          members?: string[] | null
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_read: boolean | null
          message_type: Database["public"]["Enums"]["chat_type"]
          recipient_id: string | null
          sender_id: string
          sender_name: string
          sender_photo: string | null
          text: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: Database["public"]["Enums"]["chat_type"]
          recipient_id?: string | null
          sender_id: string
          sender_name: string
          sender_photo?: string | null
          text: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: Database["public"]["Enums"]["chat_type"]
          recipient_id?: string | null
          sender_id?: string
          sender_name?: string
          sender_photo?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      client_services: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          display_id: string
          documents: Json | null
          family_members: Json | null
          id: string
          request_month: string | null
          service: string
          service_details: Json | null
          service_subcategory: string | null
          status: Database["public"]["Enums"]["client_status"] | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          display_id: string
          documents?: Json | null
          family_members?: Json | null
          id?: string
          request_month?: string | null
          service: string
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          display_id?: string
          documents?: Json | null
          family_members?: Json | null
          id?: string
          request_month?: string | null
          service?: string
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "client_services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          assigned_to: string | null
          client_type: string | null
          company_name: string | null
          company_number: string | null
          created_at: string
          created_by: string
          display_id: string
          documents: Json | null
          email: string | null
          family_members: Json | null
          id: string
          important_dates: Json | null
          lead_source: string | null
          mobile: string
          name: string
          nationality: string | null
          notes: string | null
          passport_no: string | null
          payment_type: string | null
          profit: number | null
          revenue: number | null
          service: string | null
          service_details: Json | null
          service_subcategory: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_type?: string | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          created_by: string
          display_id: string
          documents?: Json | null
          email?: string | null
          family_members?: Json | null
          id?: string
          important_dates?: Json | null
          lead_source?: string | null
          mobile: string
          name: string
          nationality?: string | null
          notes?: string | null
          passport_no?: string | null
          payment_type?: string | null
          profit?: number | null
          revenue?: number | null
          service?: string | null
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_type?: string | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          created_by?: string
          display_id?: string
          documents?: Json | null
          email?: string | null
          family_members?: Json | null
          id?: string
          important_dates?: Json | null
          lead_source?: string | null
          mobile?: string
          name?: string
          nationality?: string | null
          notes?: string | null
          passport_no?: string | null
          payment_type?: string | null
          profit?: number | null
          revenue?: number | null
          service?: string | null
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          achieved: number | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_id: string
          end_date: string | null
          goal_tasks: Json | null
          id: string
          service: string
          start_date: string | null
          target: number | null
          title: string | null
          year_month: string
        }
        Insert: {
          achieved?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_id: string
          end_date?: string | null
          goal_tasks?: Json | null
          id?: string
          service: string
          start_date?: string | null
          target?: number | null
          title?: string | null
          year_month: string
        }
        Update: {
          achieved?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_id?: string
          end_date?: string | null
          goal_tasks?: Json | null
          id?: string
          service?: string
          start_date?: string | null
          target?: number | null
          title?: string | null
          year_month?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number | null
          display_id: string
          document: Json | null
          employee_id: string
          employee_name: string
          end_date: string
          id: string
          leave_type: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"] | null
        }
        Insert: {
          created_at?: string
          days?: number | null
          display_id: string
          document?: Json | null
          employee_id: string
          employee_name: string
          end_date: string
          id?: string
          leave_type?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"] | null
        }
        Update: {
          created_at?: string
          days?: number | null
          display_id?: string
          document?: Json | null
          employee_id?: string
          employee_name?: string
          end_date?: string
          id?: string
          leave_type?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          absence_deduction: number | null
          absent_days: number | null
          allowances: number | null
          base_salary: number | null
          bonus: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          display_id: string
          employee_id: string
          final_salary: number | null
          id: string
          late_days: number | null
          late_deduction: number | null
          overtime: number | null
          paid_leave_days: number | null
          present_days: number | null
          sick_deduction: number | null
          sick_leave: number | null
          status: Database["public"]["Enums"]["payroll_status"] | null
          total_deductions: number | null
          total_hours: number | null
          unpaid_deduction: number | null
          unpaid_leave: number | null
          year_month: string
        }
        Insert: {
          absence_deduction?: number | null
          absent_days?: number | null
          allowances?: number | null
          base_salary?: number | null
          bonus?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_id: string
          employee_id: string
          final_salary?: number | null
          id?: string
          late_days?: number | null
          late_deduction?: number | null
          overtime?: number | null
          paid_leave_days?: number | null
          present_days?: number | null
          sick_deduction?: number | null
          sick_leave?: number | null
          status?: Database["public"]["Enums"]["payroll_status"] | null
          total_deductions?: number | null
          total_hours?: number | null
          unpaid_deduction?: number | null
          unpaid_leave?: number | null
          year_month: string
        }
        Update: {
          absence_deduction?: number | null
          absent_days?: number | null
          allowances?: number | null
          base_salary?: number | null
          bonus?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_id?: string
          employee_id?: string
          final_salary?: number | null
          id?: string
          late_days?: number | null
          late_deduction?: number | null
          overtime?: number | null
          paid_leave_days?: number | null
          present_days?: number | null
          sick_deduction?: number | null
          sick_leave?: number | null
          status?: Database["public"]["Enums"]["payroll_status"] | null
          total_deductions?: number | null
          total_hours?: number | null
          unpaid_deduction?: number | null
          unpaid_leave?: number | null
          year_month?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allowed_ips: string[] | null
          base_salary: number | null
          created_at: string
          email: string
          emirates_id: string | null
          id: string
          leave_balance: number | null
          mobile: string | null
          name: string
          passport_no: string | null
          photo_url: string | null
          profile_type:
            | Database["public"]["Enums"]["employee_profile_type"]
            | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_ips?: string[] | null
          base_salary?: number | null
          created_at?: string
          email: string
          emirates_id?: string | null
          id?: string
          leave_balance?: number | null
          mobile?: string | null
          name: string
          passport_no?: string | null
          photo_url?: string | null
          profile_type?:
            | Database["public"]["Enums"]["employee_profile_type"]
            | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_ips?: string[] | null
          base_salary?: number | null
          created_at?: string
          email?: string
          emirates_id?: string | null
          id?: string
          leave_balance?: number | null
          mobile?: string | null
          name?: string
          passport_no?: string | null
          photo_url?: string | null
          profile_type?:
            | Database["public"]["Enums"]["employee_profile_type"]
            | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          client_id: string | null
          client_name: string | null
          display_id: string
          emailed_at: string | null
          generated_at: string
          generated_by: string | null
          id: string
          line_items: Json | null
          payable_amount: number | null
          profit: number | null
          quoted_price: number | null
          service: string | null
          status: string | null
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          display_id: string
          emailed_at?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_items?: Json | null
          payable_amount?: number | null
          profit?: number | null
          quoted_price?: number | null
          service?: string | null
          status?: string | null
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          display_id?: string
          emailed_at?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_items?: Json | null
          payable_amount?: number | null
          profit?: number | null
          quoted_price?: number | null
          service?: string | null
          status?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          client_id: string | null
          client_name: string | null
          completed_date: string | null
          created_at: string
          created_by: string
          display_id: string
          due_date: string | null
          id: string
          notes: string | null
          profit: number | null
          service: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          client_id?: string | null
          client_name?: string | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          display_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          profit?: number | null
          service?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          client_id?: string | null
          client_name?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          display_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          profit?: number | null
          service?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_display_id: { Args: { prefix: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employee"
      attendance_status: "Present" | "Late" | "Absent"
      chat_type: "group" | "direct"
      client_status: "New" | "Processing" | "Success" | "Failed"
      employee_profile_type: "office" | "sales"
      leave_status: "Pending" | "Approved" | "Rejected"
      payroll_status: "Draft" | "Confirmed"
      task_status: "New" | "Processing" | "Completed"
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
  public: {
    Enums: {
      app_role: ["admin", "employee"],
      attendance_status: ["Present", "Late", "Absent"],
      chat_type: ["group", "direct"],
      client_status: ["New", "Processing", "Success", "Failed"],
      employee_profile_type: ["office", "sales"],
      leave_status: ["Pending", "Approved", "Rejected"],
      payroll_status: ["Draft", "Confirmed"],
      task_status: ["New", "Processing", "Completed"],
    },
  },
} as const
