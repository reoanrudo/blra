import { NextRequest, NextResponse } from "next/server";
import { createCheckItem, updateCheckItem, deleteCheckItem } from "@/lib/practice/project";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateCheckItem(id, {
      title: body.title,
      evidenceText: body.evidenceText,
      drawingNote: body.drawingNote,
      calculationMemo: body.calculationMemo,
      consultationMemo: body.consultationMemo,
      sortOrder: body.sortOrder,
    });
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
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
  await deleteCheckItem(id);
  return NextResponse.json({ ok: true });
}
