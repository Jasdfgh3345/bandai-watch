import { NextRequest, NextResponse } from "next/server";
import { runMonitor } from "@/lib/monitor";
import { dispatchPendingNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized or CRON_SECRET missing" }, { status: 401 });
  }
  try {
    const monitor = await runMonitor();
    const notifications = await dispatchPendingNotifications();
    return NextResponse.json({ ok: true, monitor, notifications, checkedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Monitor failed" }, { status: 500 });
  }
}