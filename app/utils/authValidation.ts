const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const validateAuthEmail = (email: string) => {
  if (!email.trim()) {
    return "Email is required."
  }

  if (!emailRegex.test(email.trim())) {
    return "Enter a valid email address."
  }

  return true
}

export const validateAuthPassword = (password: string, mode: "login" | "register") => {
  if (!password) {
    return "Password is required."
  }

  if (mode === "register" && password.trim().length < 15) {
    return "Password must be at least 15 characters long."
  }

  if (password.length > 128) {
    return "Password must be 128 characters or less."
  }

  return true
}
