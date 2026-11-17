import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "BANDAI WATCH",
    version: "1.0.0",
    monitoring: "not_configured",
    message: "App server is running. Configure sources and database before live monitoring."
  });
}