import { existsSync } from "node:fs"
import { join } from "node:path"

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}
