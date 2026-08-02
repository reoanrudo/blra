import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/practice/project";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const project = await createProject({
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
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
