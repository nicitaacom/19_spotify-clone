import { User } from "@supabase/supabase-js"

import supabaseAdmin from "@/app/libs/supabaseAdmin"

const getEmail = (user: User, username: string) => {
  return user.email ?? user.user_metadata.email ?? `${username}@users.noreply.github.com`
}

const getFullName = (user: User) => {
  return user.user_metadata.full_name ?? user.user_metadata.name ?? user.user_metadata.user_name ?? null
}

const getUsername = (user: User) => {
  return (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    user.user_metadata.username ??
    user.user_metadata.login ??
    user.email?.split("@")[0] ??
    `user_${user.id.slice(0, 8)}`
  )
}

const getAvatarUrl = (user: User) => {
  return (
    user.user_metadata.avatar_url ??
    user.user_metadata.picture ??
    user.identities?.find(identity => identity.identity_data?.avatar_url)?.identity_data?.avatar_url ??
    null
  )
}

export const upsertSpotifyUserFn = async (user: User, provider: string) => {
  const authUser = user as User & {
    email_confirmed_at?: string | null
    phone_confirmed_at?: string | null
  }

  const { data: existingUser, error: selectError } = await supabaseAdmin
    .from("users_19_spotify")
    .select("id, providers")
    .eq("id", user.id)
    .maybeSingle()

  if (selectError) {
    return `[AUTH]: ${selectError.message}`
  }

  const fullName = getFullName(user)
  const avatarUrl = getAvatarUrl(user)
  const username = getUsername(user)
  const email = getEmail(user, username)
  const providers = existingUser?.providers?.includes(provider) ? existingUser.providers : [...(existingUser?.providers ?? []), provider]
  const emailVerifiedAt = authUser.email_confirmed_at ?? null
  const phoneVerifiedAt = authUser.phone_confirmed_at ?? null

  if (!existingUser) {
    const { error: insertError } = await supabaseAdmin.from("users_19_spotify").insert({
      id: user.id,
      email,
      email_verified_at: emailVerifiedAt,
      full_name: fullName,
      avatar_url: avatarUrl,
      phone: user.phone ?? null,
      phone_verified_at: phoneVerifiedAt,
      providers,
      roles: ["USER"],
      username,
    })

    return insertError ? `[AUTH]: ${insertError.message}` : undefined
  }

  const { error: updateError } = await supabaseAdmin
    .from("users_19_spotify")
    .update({
      avatar_url: avatarUrl,
      email,
      email_verified_at: emailVerifiedAt,
      full_name: fullName,
      phone: user.phone ?? null,
      phone_verified_at: phoneVerifiedAt,
      providers,
      username,
    })
    .eq("id", user.id)

  return updateError ? `[AUTH]: ${updateError.message}` : undefined
}
