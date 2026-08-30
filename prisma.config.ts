import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    // `env()` from prisma/config throws when the variable is unset, and this
    // file is loaded by every CLI command — including the `prisma generate`
    // that runs on postinstall. A CI or Docker install legitimately has no
    // database URL, so read it directly and let the commands that actually
    // connect complain instead of breaking codegen for everyone.
    url:
      process.env.MONGODB_URI ??
      "mongodb://MONGODB_URI-is-unset.invalid:27017/unset",
  },
});
