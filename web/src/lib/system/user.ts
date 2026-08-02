import { prisma } from "@/lib/db";

let cachedUserId: string | null = null;

/** MVP: single local user. Get or create the default user ID. */
export async function getOrCreateDefaultUser(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  let user = await prisma.user.findFirst({ where: { name: "default" } });
  if (!user) {
    user = await prisma.user.create({ data: { name: "default" } });
  }
  cachedUserId = user.id;
  return cachedUserId;
}
