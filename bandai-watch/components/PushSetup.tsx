 "use client";
import { useState } from "react";
import { BellRing, CheckCircle2, Smartphone } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
export default function PushSetup() {
  const [state, setState] = useState("网页推送尚未启用");
  const [busy, setBusy] = useState(false);
  async function enable() {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("当前浏览器不支持 Web Push。请使用支持推送的浏览器并通过 HTTPS 访问。");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("尚未配置 NEXT_PUBLIC_VAPID_PUBLIC_KEY。");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("你没有授权通知权限。");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error((await response.json()).error || "订阅保存失败");
      setState("网页推送已启用");
    } catch (e: any) { setState(e?.message || "启用失败"); }
    finally { setBusy(false); }
  }
  return <div style={{display:"grid",gap:8}}>
    <button className="primary" disabled={busy} onClick={enable}><BellRing size={14} style={{display:"inline",marginRight:7}}/>{busy?"正在启用…":"启用网页推送"}</button>
    <div style={{fontSize:10,color:"var(--muted)",lineHeight:1.6}}>{state}</div>
    <div style={{fontSize:10,color:"var(--muted)",lineHeight:1.6}}><Smartphone size={12} style={{display:"inline",marginRight:5}}/>iPhone 原生推送需要后续安装原生 App 并注册 APNs 设备令牌。</div>
  </div>;
}