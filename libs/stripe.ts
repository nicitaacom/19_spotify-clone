import Stripe from "stripe"

export const stripe = new Stripe(
  process.env.NODE_ENV === "production" ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST,
  {
    apiVersion: "2022-11-15",
    appInfo: {
      name: "Spotify Clone",
      version: "0.1.0",
    },
  },
)
