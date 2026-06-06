import { create } from "zustand"

type AuthMode = "login" | "register" | "recover"
type AuthStatus = "error" | "info" | "success"

interface AuthStore {
  emailInputValue: string
  setEmailInputValue: (value: string) => void
  emailInputError: string
  setEmailInputError: (error: string) => void

  passwordInputValue: string
  setPasswordInputValue: (value: string) => void
  passwordInputError: string
  setPasswordInputError: (error: string) => void

  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void

  authMessage: string
  setAuthMessage: (message: string) => void
  authStatus: AuthStatus
  setAuthStatus: (status: AuthStatus) => void

  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  resetAuthState: () => void
}

export const useAuthStore = create<AuthStore>(set => ({
  emailInputValue: "",
  setEmailInputValue: emailInputValue => set({ emailInputValue }),
  emailInputError: "",
  setEmailInputError: emailInputError => set({ emailInputError }),

  passwordInputValue: "",
  setPasswordInputValue: passwordInputValue => set({ passwordInputValue }),
  passwordInputError: "",
  setPasswordInputError: passwordInputError => set({ passwordInputError }),

  authMode: "login",
  setAuthMode: authMode => set({ authMode }),

  authMessage: "",
  setAuthMessage: authMessage => set({ authMessage }),
  authStatus: "error",
  setAuthStatus: authStatus => set({ authStatus }),

  isLoading: false,
  setIsLoading: isLoading => set({ isLoading }),

  resetAuthState: () =>
    set({
      authMode: "login",
      authMessage: "",
      authStatus: "error",
      emailInputValue: "",
      emailInputError: "",
      passwordInputValue: "",
      passwordInputError: "",
      isLoading: false,
    }),
}))
