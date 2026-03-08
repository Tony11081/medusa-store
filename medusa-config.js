const { loadEnv, defineConfig } = require("@medusajs/framework/utils")

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const databaseUrl = process.env.DATABASE_URL
const databaseDriverOptions = databaseUrl?.match(
  /localhost|127\.0\.0\.1|ssl_mode=(disable|false)|sslmode=(disable)/i
)
  ? { connection: { ssl: false } }
  : undefined

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
})
