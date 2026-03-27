import Stripe from "stripe"

export interface Song {
  id: string
  user_id: string
  author: string
  title: string
  song_path: string
  image_path: string
}

export type PlaylistVisibility = "public" | "unlisted" | "private"

export interface Playlist {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  slug: string
  title: string
  description: string | null
  visibility: PlaylistVisibility
}

export interface PlaylistSong {
  playlist_id: string
  song_id: Song["id"]
  position: number
  created_at: string
}

export interface PlaylistAuthor {
  id: string
  avatar_url?: string | null
  full_name?: string | null
  username: string
}

export interface PlaylistSongWithSong extends PlaylistSong {
  song: Song
}

export interface PlaylistSummary extends Playlist {
  author: PlaylistAuthor
  cover_image_path?: string | null
  song_count: number
}

export interface PlaylistDetail extends Playlist {
  author: PlaylistAuthor
  cover_image_path?: string | null
  songs: PlaylistSongWithSong[]
}

export interface PlaylistOption {
  id: string
  title: string
  updated_at: string
  visibility: PlaylistVisibility
}

export interface Product {
  id: string
  active?: boolean
  name?: string
  description?: string
  image?: string
  metadata?: Stripe.Metadata
}

export interface Price {
  id: string
  product_id?: string
  active?: boolean
  description?: string
  unit_amount?: number
  currency?: string
  type?: Stripe.Price.Type
  interval?: Stripe.Price.Recurring.Interval
  interval_count?: number
  trial_period_days?: number | null
  metadata?: Stripe.Metadata
  products?: Product
}

export interface Customer {
  id: string
  stripe_customer_id?: string
}

export interface UserDetails {
  id: string
  created_at?: string
  email: string
  email_verified_at?: string | null
  full_name?: string
  encrypted_password?: string | null
  is_otp_enabled?: boolean
  avatar_url?: string
  otp_encrypted_secret?: string | null
  phone?: string | null
  phone_verified_at?: string | null
  providers?: string[]
  roles?: string[]
  username: string
  verification_email_sent_at?: string | null
  billing_address?: Stripe.Address
  payment_method?: Stripe.PaymentMethod[Stripe.PaymentMethod.Type]
}

export interface ProductWithPrice extends Product {
  prices?: Price[]
}

export interface Subscription {
  id: string
  user_id: string
  status?: Stripe.Subscription.Status
  metadata?: Stripe.Metadata
  price_id?: string
  quantity?: number
  cancel_at_period_end?: boolean
  created: string
  current_period_start: string
  current_period_end: string
  ended_at?: string
  cancel_at?: string
  canceled_at?: string
  trial_start?: string
  trial_end?: string
  prices?: Price
}
