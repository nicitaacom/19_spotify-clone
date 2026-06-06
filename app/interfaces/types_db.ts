export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      "19_customers": {
        Row: { id: string; stripe_customer_id: string | null }
        Insert: { id: string; stripe_customer_id?: string | null }
        Update: { id?: string; stripe_customer_id?: string | null }
        Relationships: []
      }
      "19_liked_songs": {
        Row: { created_at: string; song_id: number; user_id: string }
        Insert: { created_at?: string; song_id: number; user_id: string }
        Update: { created_at?: string; song_id?: number; user_id?: string }
        Relationships: []
      }
      "19_playlist_songs": {
        Row: { created_at: string; playlist_id: string; position: number; song_id: number }
        Insert: { created_at?: string; playlist_id: string; position: number; song_id: number }
        Update: { created_at?: string; playlist_id?: string; position?: number; song_id?: number }
        Relationships: []
      }
      "19_playlists": {
        Row: {
          created_at: string
          description: string | null
          id: string
          slug: string
          title: string
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["playlist_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          slug: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["playlist_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          slug?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["playlist_visibility"]
        }
        Relationships: []
      }
      "19_prices": {
        Row: {
          active: boolean | null
          currency: string | null
          description: string | null
          id: string
          interval: Database["public"]["Enums"]["pricing_plan_interval"] | null
          interval_count: number | null
          metadata: Json | null
          product_id: string | null
          trial_period_days: number | null
          type: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount: number | null
        }
        Insert: {
          active?: boolean | null
          currency?: string | null
          description?: string | null
          id: string
          interval?: Database["public"]["Enums"]["pricing_plan_interval"] | null
          interval_count?: number | null
          metadata?: Json | null
          product_id?: string | null
          trial_period_days?: number | null
          type?: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount?: number | null
        }
        Update: {
          active?: boolean | null
          currency?: string | null
          description?: string | null
          id?: string
          interval?: Database["public"]["Enums"]["pricing_plan_interval"] | null
          interval_count?: number | null
          metadata?: Json | null
          product_id?: string | null
          trial_period_days?: number | null
          type?: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount?: number | null
        }
        Relationships: []
      }
      "19_products": {
        Row: { active: boolean | null; description: string | null; id: string; image: string | null; metadata: Json | null; name: string | null }
        Insert: { active?: boolean | null; description?: string | null; id: string; image?: string | null; metadata?: Json | null; name?: string | null }
        Update: { active?: boolean | null; description?: string | null; id?: string; image?: string | null; metadata?: Json | null; name?: string | null }
        Relationships: []
      }
      "19_songs": {
        Row: { author: string | null; created_at: string; id: number; image_path: string | null; song_path: string | null; title: string | null; user_id: string | null }
        Insert: { author?: string | null; created_at?: string; id?: number; image_path?: string | null; song_path?: string | null; title?: string | null; user_id?: string | null }
        Update: { author?: string | null; created_at?: string; id?: number; image_path?: string | null; song_path?: string | null; title?: string | null; user_id?: string | null }
        Relationships: []
      }
      "19_subscriptions": {
        Row: {
          cancel_at: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created: string
          current_period_end: string
          current_period_start: string
          ended_at: string | null
          id: string
          metadata: Json | null
          price_id: string | null
          quantity: number | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          trial_end: string | null
          trial_start: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          id: string
          metadata?: Json | null
          price_id?: string | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_end?: string | null
          trial_start?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          price_id?: string | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_end?: string | null
          trial_start?: string | null
          user_id?: string
        }
        Relationships: []
      }
      19_users: {
        Row: {
          avatar_url: string | null
          billing_address: Json | null
          created_at: string
          email: string
          email_verified_at: string | null
          encrypted_password: string | null
          full_name: string | null
          id: string
          is_otp_enabled: boolean
          otp_encrypted_secret: string | null
          payment_method: Json | null
          phone: string | null
          phone_verified_at: string | null
          providers: string[]
          roles: string[]
          username: string
          verification_email_sent_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          billing_address?: Json | null
          created_at?: string
          email: string
          email_verified_at?: string | null
          encrypted_password?: string | null
          full_name?: string | null
          id: string
          is_otp_enabled?: boolean
          otp_encrypted_secret?: string | null
          payment_method?: Json | null
          phone?: string | null
          phone_verified_at?: string | null
          providers?: string[]
          roles?: string[]
          username: string
          verification_email_sent_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          billing_address?: Json | null
          created_at?: string
          email?: string
          email_verified_at?: string | null
          encrypted_password?: string | null
          full_name?: string | null
          id?: string
          is_otp_enabled?: boolean
          otp_encrypted_secret?: string | null
          payment_method?: Json | null
          phone?: string | null
          phone_verified_at?: string | null
          providers?: string[]
          roles?: string[]
          username?: string
          verification_email_sent_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: { avatar_url: string | null; billing_address: Json | null; full_name: string | null; id: string; payment_method: Json | null }
        Insert: { avatar_url?: string | null; billing_address?: Json | null; full_name?: string | null; id: string; payment_method?: Json | null }
        Update: { avatar_url?: string | null; billing_address?: Json | null; full_name?: string | null; id?: string; payment_method?: Json | null }
        Relationships: []
      }
      utm_stats: {
        Row: {
          id: string
          created_at: string
          user_id: string
          source: string | null
          medium: string | null
          campaign: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          source?: string | null
          medium?: string | null
          campaign?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          source?: string | null
          medium?: string | null
          campaign?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      playlist_visibility: "public" | "unlisted" | "private"
      pricing_plan_interval: "day" | "week" | "month" | "year"
      pricing_type: "one_time" | "recurring"
      subscription_status:
        | "trialing"
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "unpaid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
