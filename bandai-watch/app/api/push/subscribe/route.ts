import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    const db = getAdminDb();
    const { error } = await db.from("web_push_subscriptions").upsert({ endpoint: body.endpoint, keys: body.keys, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: e.message || "Subscribe failed" }, { status: 500 }); }
}
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    const { error } = await getAdminDb().from("web_push_subscriptions").delete().eq("endpoint", body.endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: e.message || "Unsubscribe failed" }, { status: 500 }); }
}