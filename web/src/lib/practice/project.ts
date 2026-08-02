import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/system/user";
import type { CheckItem, ProjectProfile } from "@prisma/client";
import type { ValidApplicabilitySnapshot } from "@/lib/applicability/applicability-snapshot";

export interface ProjectWithChecks extends ProjectProfile {
  checkItems: CheckItem[];
}

export async function listProjects(): Promise<ProjectProfile[]> {
  const userId = await getOrCreateDefaultUser();
  return prisma.projectProfile.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { checkItems: true },
  });
}

export async function getProject(
  projectId: string,
): Promise<ProjectWithChecks | null> {
  const userId = await getOrCreateDefaultUser();
  return prisma.projectProfile.findFirst({
    where: { id: projectId, userId },
    include: { checkItems: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createProject(data: {
  name: string;
  usage?: string;
  siteArea?: number;
  buildingArea?: number;
  totalFloorArea?: number;
  floors?: number;
  structure?: string;
  useDistrict?: string;
  fireDistrict?: string;
  roadAccess?: string;
  municipality?: string;
}): Promise<ProjectProfile> {
  const userId = await getOrCreateDefaultUser();
  return prisma.projectProfile.create({
    data: { userId, ...data },
  });
}

export async function updateProject(
  projectId: string,
  data: Partial<{
    name: string;
    usage: string;
    siteArea: number;
    buildingArea: number;
    totalFloorArea: number;
    floors: number;
    structure: string;
    useDistrict: string;
    fireDistrict: string;
    roadAccess: string;
    municipality: string;
  }>,
): Promise<ProjectProfile> {
  const userId = await getOrCreateDefaultUser();
  return prisma.projectProfile.update({
    where: { id: projectId, userId },
    data,
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  const userId = await getOrCreateDefaultUser();
  await prisma.projectProfile.delete({ where: { id: projectId, userId } });
}

// ─── CheckItem ───

export async function listCheckItems(projectId: string): Promise<CheckItem[]> {
  const userId = await getOrCreateDefaultUser();
  // Verify ownership via project
  const project = await prisma.projectProfile.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return [];
  return prisma.checkItem.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createCheckItem(data: {
  projectId: string;
  articleId: string;
  title?: string;
  evidenceText?: string;
  drawingNote?: string;
  calculationMemo?: string;
  consultationMemo?: string;
  sortOrder?: number;
  snapshot?: ValidApplicabilitySnapshot | null;
}): Promise<CheckItem | null> {
  const userId = await getOrCreateDefaultUser();
  const project = await prisma.projectProfile.findFirst({
    where: { id: data.projectId, userId },
    select: { id: true },
  });
  if (!project) return null;
  return prisma.checkItem.create({
    data: {
      projectId: data.projectId,
      articleId: data.articleId,
      title: data.title,
      evidenceText: data.evidenceText,
      drawingNote: data.drawingNote,
      calculationMemo: data.calculationMemo,
      consultationMemo: data.consultationMemo,
      sortOrder: data.sortOrder ?? 0,
      status: "unchecked",
      source: "manual",
      ...(data.snapshot
        ? {
            applicabilityAnchor: data.snapshot.applicabilityAnchor,
            applicabilityDate: new Date(
              `${data.snapshot.applicabilityDate}T00:00:00.000Z`,
            ),
            snapshotLawRevisionId: data.snapshot.snapshotLawRevisionId,
          }
        : {}),
    },
  });
}

export async function updateCheckItemStatus(
  checkItemId: string,
  status: "unchecked" | "applicable" | "not_applicable" | "ok" | "ng" | "needs_consultation",
): Promise<CheckItem | null> {
  const userId = await getOrCreateDefaultUser();
  // Verify ownership via project
  const item = await prisma.checkItem.findFirst({
    where: { id: checkItemId },
    include: { project: { select: { userId: true } } },
  });
  if (!item || item.project.userId !== userId) return null;
  return prisma.checkItem.update({
    where: { id: checkItemId },
    data: { status },
  });
}

export async function updateCheckItem(
  checkItemId: string,
  data: Partial<{
    title: string;
    evidenceText: string;
    drawingNote: string;
    calculationMemo: string;
    consultationMemo: string;
    sortOrder: number;
  }>,
): Promise<CheckItem | null> {
  const userId = await getOrCreateDefaultUser();
  const item = await prisma.checkItem.findFirst({
    where: { id: checkItemId },
    include: { project: { select: { userId: true } } },
  });
  if (!item || item.project.userId !== userId) return null;
  return prisma.checkItem.update({
    where: { id: checkItemId },
    data,
  });
}

export async function deleteCheckItem(checkItemId: string): Promise<void> {
  const userId = await getOrCreateDefaultUser();
  const item = await prisma.checkItem.findFirst({
    where: { id: checkItemId },
    include: { project: { select: { userId: true } } },
  });
  if (!item || item.project.userId !== userId) return;
  await prisma.checkItem.delete({ where: { id: checkItemId } });
}

// ─── Active Project ───

export async function getActiveProject(): Promise<ProjectProfile | null> {
  const userId = await getOrCreateDefaultUser();
  return prisma.projectProfile.findFirst({
    where: { userId, isActive: true },
  });
}

export async function setActiveProject(projectId: string): Promise<ProjectProfile> {
  const userId = await getOrCreateDefaultUser();
  await prisma.$transaction([
    prisma.projectProfile.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    }),
    prisma.projectProfile.update({
      where: { id: projectId, userId },
      data: { isActive: true },
    }),
  ]);
  return prisma.projectProfile.findFirstOrThrow({
    where: { id: projectId, userId },
  });
}
