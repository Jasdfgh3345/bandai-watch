import webpush from "web-push";
import apn from "apn";
import { getAdminDb } from "./supabase-admin";

type EventRow = { id:string; product_id:string; event_type:string; title:string; detail:string|null; source_url:string|null };
function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}
function apnProvider() {
  const key = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!key || !keyId || !teamId || !bundleId) return null;
  return new apn.Provider({ token: { key, keyId, teamId }, production: process.env.APNS_PRODUCTION === "true" });
}
export async function dispatchPendingNotifications(limit = 100) {
  const db = getAdminDb();
  const { data: events, error } = await db.from("monitor_events").select("*").is("notification_sent_at", null).order("detected_at").limit(limit);
  if (error) throw error;
  if (!events?.length) return { queued: 0, sent: 0, failed: 0 };
  const webReady = configureWebPush();
  const provider = apnProvider();
  const { data: webSubs } = await db.from("web_push_subscriptions").select("*");
  const { data: iosDevices } = await db.from("ios_push_devices").select("*");
  let sent = 0, failed = 0;
  for (const ev of events as EventRow[]) {
    const payload = JSON.stringify({ title: ev.title, body: ev.detail || "BANDAI WATCH 检测到商品状态变化。", url: ev.source_url || "/" });
    let attempted = 0, errors = 0;
    if (webReady && webSubs?.length) {
      for (const sub of webSubs) {
        attempted++;
        try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload); }
        catch (e: any) { errors++; if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("web_push_subscriptions").delete().eq("id", sub.id); }
      }
    }
    if (provider && iosDevices?.length) {
      for (const device of iosDevices) {
        attempted++;
        try {
          const notification = new apn.Notification();
          notification.topic = process.env.APNS_BUNDLE_ID!;
          notification.alert = { title: ev.title, body: ev.detail || "BANDAI WATCH 检测到商品状态变化。" };
          notification.sound = "default";
          notification.payload = { url: ev.source_url || "/", eventId: ev.id };
          const result = await provider.send(notification, device.device_token);
          if (result.failed?.length) errors++;
        } catch { errors++; }
      }
    }
    // Do not mark as sent if no channel is configured; retain event for later retry.
    if (attempted > 0 && errors === 0) {
      await db.from("monitor_events").update({ notification_sent_at: new Date().toISOString() }).eq("id", ev.id);
      sent++;
    } else if (attempted > 0) failed++;
  }
  provider?.shutdown();
  return { queued: events.length, sent, failed };
}