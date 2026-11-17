import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.deviceToken !== "string" || !/^[a-fA-F0-9]{64,200}$/.test(body.deviceToken)) return NextResponse.json({ error: "Invalid APNs device token" }, { status: 400 });
    const { error } = await getAdminDb().from("ios_push_devices").upsert({ device_token: body.deviceToken, updated_at: new Date().toISOString() }, { onConflict: "device_token" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: e.message || "Device registration failed" }, { status: 500 }); }
}