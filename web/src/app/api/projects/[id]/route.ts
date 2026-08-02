import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject, deleteProject } from "@/lib/practice/project";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateProject(id, {
      name: body.name,
      usage: body.usage,
      siteArea: body.siteArea ? Number(body.siteArea) : undefined,
      buildingArea: body.buildingArea ? Number(body.buildingArea) : undefined,
      totalFloorArea: body.totalFloorArea ? Number(body.totalFloorArea) : undefined,
      floors: body.floors ? Number(body.floors) : undefined,
      structure: body.structure,
      useDistrict: body.useDistrict,
      fireDistrict: body.fireDistrict,
      roadAccess: body.roadAccess,
      municipality: body.municipality,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
