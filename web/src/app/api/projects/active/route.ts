import { NextRequest, NextResponse } from "next/server";
import { getActiveProject, setActiveProject } from "@/lib/practice/project";

export async function GET() {
  try {
    const project = await getActiveProject();
    if (!project) {
      return NextResponse.json(null);
    }
    return NextResponse.json({ id: project.id, name: project.name });
  } catch {
    return NextResponse.json(null);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const project = await setActiveProject(projectId);
    return NextResponse.json({ id: project.id, name: project.name });
  } catch {
    return NextResponse.json({ error: "set active failed" }, { status: 500 });
  }
}
