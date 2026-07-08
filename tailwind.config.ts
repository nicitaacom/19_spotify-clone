import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          DEFAULT: "#4ade80",
          strong: "#6ef0a0",
        },
        "dark-base": "#080808",
        surface: "#111111",
        elevated: "#1a1a1a",
      },
      boxShadow: {
        neon: "0 0 8px rgba(74,222,128,0.15)",
        "neon-sm": "0 0 6px rgba(74,222,128,0.12)",
        "neon-lg": "0 0 12px rgba(74,222,128,0.18)",
      },
      keyframes: {
        "pulse-glow": {
          "0%,100%": { boxShadow: "0 0 10px rgba(74,222,128,0.35)" },
          "50%": { boxShadow: "0 0 22px rgba(74,222,128,0.6)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "kenburns": "kenburns 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
export default config
