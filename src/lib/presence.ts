import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

let channel: RealtimeChannel | null = null;
let inbox: RealtimeChannel | null = null;
let online = new Set<string>();
const subs = new Set<() => void>();

export function startPresence(uid: string) {
  if (channel) return;
  channel = supabase.channel("afued-online", { config: { presence: { key: uid } } });
  channel
    .on("presence", { event: "sync" }, () => {
      online = new Set(Object.keys(channel!.presenceState()));
      subs.forEach((f) => f());
    })
    .subscribe(async (s) => {
      if (s === "SUBSCRIBED") await channel!.track({ at: Date.now() });
    });

  // Mark messages to me as delivered
  const markDelivered = () =>
    supabase.from("messages").update({ delivered_at: new Date().toISOString() }).eq("receiver_id", uid).is("delivered_at", null).then(() => {});
  markDelivered();
  inbox = supabase
    .channel(`inbox-${uid}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${uid}` }, markDelivered)
    .subscribe();
}

export function stopPresence() {
  if (channel) supabase.removeChannel(channel);
  if (inbox) supabase.removeChannel(inbox);
  channel = inbox = null;
  online = new Set();
  subs.forEach((f) => f());
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => online,
    () => online,
  );
}
