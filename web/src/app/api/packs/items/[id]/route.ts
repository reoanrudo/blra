import { NextRequest, NextResponse } from "next/server";
import { updatePackItem, removePackItem } from "@/lib/practice/practice";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updatePackItem(id, {
      checked: body.checked,
      note: body.note,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "not found or inaccessible" },
        { status: 404 },
      );
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
  await removePackItem(id);
  return NextResponse.json({ ok: true });
}
