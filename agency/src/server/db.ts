import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  return new PrismaClient({ adapter });
}

/** Single PrismaClient per process (reused across hot reloads in development). */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    globalForPrisma.prisma ??= create();
    const value = Reflect.get(globalForPrisma.prisma, prop);
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});

export async function disconnectDb() {
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
}

export * from "@/generated/prisma/client";
