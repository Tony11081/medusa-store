const { loadEnv, defineConfig, Modules } = require("@medusajs/framework/utils")

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const databaseUrl = process.env.DATABASE_URL
const databaseDriverOptions = databaseUrl?.match(
  /localhost|127\.0\.0\.1|ssl_mode=(disable|false)|sslmode=(disable)/i
)
  ? { connection: { ssl: false } }
  : undefined

const stripeEnabled =
  Boolean(process.env.STRIPE_API_KEY) &&
  Boolean(process.env.STRIPE_WEBHOOK_SECRET)

const stripeModules = stripeEnabled
  ? [
      {
        resolve: "@medusajs/medusa/payment",
        key: Modules.PAYMENT,
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/payment-stripe",
              id: "stripe",
              options: {
                apiKey: process.env.STRIPE_API_KEY,
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
                capture: process.env.STRIPE_CAPTURE !== "false",
                automaticPaymentMethods:
                  process.env.STRIPE_AUTOMATIC_PAYMENT_METHODS !== "false",
                paymentDescription:
                  process.env.STRIPE_PAYMENT_DESCRIPTION || undefined,
              },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl,
    databaseDriverOptions,
    http: {
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    disable: process.env.MEDUSA_DISABLE_ADMIN === "true",
  },
  modules: stripeModules,
})
