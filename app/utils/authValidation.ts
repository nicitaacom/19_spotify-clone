const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const validateAuthEmail = (email: string) => {
  if (!email.trim()) {
    return "Email is required."
  }

  if (email.trim().length > 254) {
    return "Email address is too long."
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

  if (password.length > 128) {
    return "Password must be 128 characters or less."
  }

  if (mode !== "register") {
    return true
  }

  if (password.length < 10) {
    return "Password must be at least 10 characters long."
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter."
  }

  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter."
  }

  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number."
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character."
  }

  return true
}

export interface PasswordValidationResult {
  isValid: boolean
  errors: string[]
  strength: "weak" | "fair" | "good" | "strong"
  score: number // 0-100
}

export const validatePasswordDetailed = (password: string): PasswordValidationResult => {
  if (!password) {
    return { isValid: false, errors: ["Password is required."], strength: "weak", score: 0 }
  }

  const errors: string[] = []

  if (password.length > 128) errors.push("Password must be 128 characters or less.")
  if (password.length < 10) errors.push("Password must be at least 10 characters long.")
  if (!/[A-Z]/.test(password)) errors.push("Must contain at least one uppercase letter.")
  if (!/[a-z]/.test(password)) errors.push("Must contain at least one lowercase letter.")
  if (!/[0-9]/.test(password)) errors.push("Must contain at least one number.")
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Must contain at least one special character.")

  // score: count satisfied criteria (6 possible) + length bonuses
  let score = 0
  if (password.length >= 10) score += 15
  if (password.length >= 16) score += 10
  if (password.length >= 20) score += 10
  if (/[A-Z]/.test(password)) score += 15
  if (/[a-z]/.test(password)) score += 15
  if (/[0-9]/.test(password)) score += 15
  if (/[^A-Za-z0-9]/.test(password)) score += 20
  score = Math.min(100, score)

  let strength: PasswordValidationResult["strength"]
  if (score < 30) strength = "weak"
  else if (score < 60) strength = "fair"
  else if (score < 85) strength = "good"
  else strength = "strong"

  return { isValid: errors.length === 0, errors, strength, score }
}
