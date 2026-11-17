import { getAdminDb } from "./supabase-admin";

export type MonitorSource = {
  id: string;
  name: string;
  url: string;
  region: "日本" | "中国大陆";
  category: "奥特曼" | "假面骑士" | "超级战队" | "万代其他收藏品";
  kind?: "listing" | "product";
};

type Snapshot = {
  title: string;
  canonicalUrl: string;
  text: string;
  bookingAt: string | null;
  status: "upcoming" | "open" | "sold_out" | "unknown";
  price: string | null;
};

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
function stripHtml(s: string) {
  return decode(s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}
function getMeta(html: string, key: string, attr = "property") {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, "i");
  return decode(html.match(re)?.[1] || html.match(alt)?.[1] || "");
}
function jsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]);
      out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {}
  }
  return out;
}
function walkJsonLd(nodes: any[]): any[] {
  const all: any[] = [];
  const visit = (x: any) => {
    if (!x || typeof x !== "object") return;
    all.push(x);
    if (Array.isArray(x)) x.forEach(visit);
    else Object.values(x).forEach(visit);
  };
  nodes.forEach(visit);
  return all;
}
function parseBookingDate(text: string): string | null {
  // Only parse explicit ISO-like dates. Localized Japanese/Chinese prose is not guessed.
  const m = text.match(/(?:预约|予約|受付|预订|開始|开始)[^。\n]{0,45}?((?:20\d{2})[-/.年](?:0?[1-9]|1[0-2])[-/.月](?:0?[1-9]|[12]\d|3[01])日?(?:\s*[T ]?\s*\d{1,2}:\d{2})?)/i);
  if (!m) return null;
  const raw = m[1].replace(/[年月]/g, "-").replace(/[日/.]/g, "-").replace(/-+$/, "").trim();
  const d = new Date(raw.replace(" ", "T") + (/\d{1,2}:\d{2}$/.test(raw) ? ":00+09:00" : "T00:00:00+09:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function classify(text: string): Snapshot["status"] {
  const t = text.toLowerCase();
  if (/予約終了|受付終了|售罄|缺货|売り切れ|在庫なし|sold\s*out|out\s*of\s*stock|受付を終了/.test(t)) return "sold_out";
  if (/予約受付中|予約開始|受付中|予約する|立即预约|马上预约|立即购买|加入购物车|add to cart|in stock|販売中/.test(t)) return "open";
  if (/予約開始予定|预约即将开始|即将预约|予約開始日時|预订开始/.test(t)) return "upcoming";
  return "unknown";
}
async function fetchSnapshot(source: MonitorSource): Promise<Snapshot> {
  const response = await fetch(source.url, {
    headers: { "user-agent": "BANDAI-WATCH personal monitoring bot/1.1 (respectful, low-frequency; contact: owner configured)", "accept": "text/html,application/xhtml+xml,application/ld+json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${source.url}`);
  const html = await response.text();
  const nodes = walkJsonLd(jsonLd(html));
  const product = nodes.find(n => n["@type"] === "Product" || (Array.isArray(n["@type"]) && n["@type"].includes("Product")));
  const title = getMeta(html, "og:title") || nodes.find(n => n["@type"] === "WebPage")?.name || product?.name || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || source.name;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || source.url;
  const text = stripHtml(html).slice(0, 120000);
  const offers = product?.offers;
  const price = (Array.isArray(offers) ? offers[0]?.price : offers?.price);
  return { title: decode(title), canonicalUrl: canonical, text, bookingAt: parseBookingDate(text), status: classify(text), price: price ? String(price) : null };
}

function eventKey(productId: string, type: string, fingerprint: string) {
  return `${productId}:${type}:${fingerprint}`.slice(0, 240);
}

async function queueEvent(db: ReturnType<typeof getAdminDb>, productId: string, type: string, title: string, detail: string, sourceUrl: string, fingerprint: string) {
  const dedupe_key = eventKey(productId, type, fingerprint);
  const { error } = await db.from("monitor_events").insert({ product_id: productId, event_type: type, title, detail, source_url: sourceUrl, dedupe_key });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}

export async function runMonitor() {
  const raw = process.env.MONITOR_SOURCES_JSON;
  if (!raw) throw new Error("MONITOR_SOURCES_JSON is missing. Add permitted official product/listing URLs before enabling monitoring.");
  const sources = JSON.parse(raw) as MonitorSource[];
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("MONITOR_SOURCES_JSON must be a non-empty JSON array.");
  const db = getAdminDb();
  const results: any[] = [];
  for (const source of sources) {
    try {
      const snap = await fetchSnapshot(source);
      const { data: existing, error: findError } = await db.from("products").select("*").eq("source_name", source.id).maybeSingle();
      if (findError) throw findError;
      const prevStatus = existing?.status || "unknown";
      const statusMap: Record<string,string> = { upcoming: "即将预约", open: "预约中", sold_out: "售罄/缺货", unknown: "监控中" };
      const row = {
        name: snap.title || source.name, category: source.category, region: source.region,
        price_text: snap.price, booking_at: snap.bookingAt, status: statusMap[snap.status],
        source_name: source.id, source_url: snap.canonicalUrl, source_product_id: source.id,
        last_checked_at: new Date().toISOString(),
        last_snapshot: { status: snap.status, title: snap.title, bookingAt: snap.bookingAt, textFingerprint: simpleHash(snap.text.slice(0, 8000)) }
      };
      let productId = existing?.id;
      if (existing) {
        const { error } = await db.from("products").update(row).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("products").insert(row).select("id").single();
        if (error) throw error;
        productId = data.id;
      }
      if (!productId) throw new Error("Could not resolve product id.");
      if (snap.status === "open" && prevStatus !== "预约中") await queueEvent(db, productId, "booking_open", `预约已开放：${snap.title}`, "监控页面出现预约开放信号，请打开官方页面核实。", snap.canonicalUrl, snap.status);
      if (snap.status === "open" && prevStatus === "sold_out") await queueEvent(db, productId, "restock", `可能补货：${snap.title}`, "页面从售罄/缺货变化为预约开放，请尽快核实。", snap.canonicalUrl, `${prevStatus}->${snap.status}:${new Date().toISOString().slice(0,13)}`);
      if (snap.bookingAt && snap.bookingAt !== existing?.booking_at) await queueEvent(db, productId, "info_changed", `预约时间更新：${snap.title}`, `识别到页面日期：${snap.bookingAt}。请核对官方时区及时间。`, snap.canonicalUrl, snap.bookingAt);
      // Queue the 24-hour reminder once per explicit booking timestamp.
      if (snap.bookingAt) {
        const msUntilBooking = new Date(snap.bookingAt).getTime() - Date.now();
        if (msUntilBooking > 0 && msUntilBooking <= 24 * 60 * 60 * 1000) {
          await queueEvent(db, productId, "booking_soon", `预约即将开始：${snap.title}`, `识别到预约时间：${snap.bookingAt}。请核对官方页面及当地时区。`, snap.canonicalUrl, snap.bookingAt);
        }
      }
      results.push({ source: source.id, ok: true, status: snap.status, title: snap.title });
    } catch (e: any) {
      results.push({ source: source.id, ok: false, error: e?.message || "Unknown error" });
    }
  }
  return { checked: sources.length, succeeded: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length, results };
}
function simpleHash(s: string) {
  let h = 2166136261;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h>>>0).toString(16);
}