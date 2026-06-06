import { User } from "@supabase/supabase-js"

import { supabaseAdmin } from "@/libs/supabaseAdmin"

const getFullName = (user: User) => {
  return user.user_metadata.full_name ?? user.user_metadata.name ?? user.user_metadata.user_name ?? null
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
  void provider

  const { data: existingUser, error: selectError } = await supabaseAdmin
    .from("19_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (selectError) {
    return `[AUTH]: ${selectError.message}`
  }

  const fullName = getFullName(user)
  const avatarUrl = getAvatarUrl(user)

  if (!existingUser) {
    const { error: insertError } = await supabaseAdmin.from("19_users").insert({
      id: user.id,
      full_name: fullName,
      avatar_url: avatarUrl,
    })

    return insertError ? `[AUTH]: ${insertError.message}` : undefined
  }

  const { error: updateError } = await supabaseAdmin
    .from("19_users")
    .update({
      avatar_url: avatarUrl,
      full_name: fullName,
    })
    .eq("id", user.id)

  return updateError ? `[AUTH]: ${updateError.message}` : undefined
}
