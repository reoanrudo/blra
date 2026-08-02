import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_KEYS = new Set([
  "useDistrict",
  "fireDistrict",
  "buildingUse",
  "structureType",
  "floors",
  "height",
  "totalFloorArea",
  "buildingCoverageRatio",
  "floorAreaRatio",
  "specialUses",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const project = await prisma.projectProfile.findUnique({
    where: { id },
    select: { id: true, name: true, conditions: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: project.id,
    name: project.name,
    conditions: project.conditions ?? {},
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  if (typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "conditions must be an object" },
      { status: 400 },
    );
  }

  // Validate keys
  for (const key of Object.keys(body)) {
    if (!VALID_KEYS.has(key)) {
      return NextResponse.json(
        { error: `Invalid condition key: ${key}` },
        { status: 400 },
      );
    }
  }

  // Validate value types
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    if (key === "specialUses") {
      if (!Array.isArray(value)) {
        return NextResponse.json(
          { error: `specialUses must be an array` },
          { status: 400 },
        );
      }
    } else if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      !Array.isArray(value)
    ) {
      return NextResponse.json(
        { error: `${key} must be string or number` },
        { status: 400 },
      );
    }
  }

  const project = await prisma.projectProfile.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.projectProfile.update({
    where: { id },
    data: { conditions: body },
    select: { id: true, name: true, conditions: true },
  });

  return NextResponse.json(updated);
}
