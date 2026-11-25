import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { api, ApiError } from "../api";
import { fmtShort } from "../dates";
import { labColour } from "../theme";
import type { Booking } from "../types";
import { Button, Card, H, Notice, T, Tag, s, useTheme } from "../ui";

const STATUS: Record<Booking["status"], [string, "ok" | "warn" | "bad" | undefined]> = {
  confirmed: ["Confirmed", "ok"], completed: ["Attended", "ok"], no_show: ["No-show", "bad"], cancelled: ["Cancelled", undefined], declined: ["Declined", "warn"],
};

/** The teacher's own bookings. Cancelling follows the same cut-off as the website (the server enforces it). */
export function MyBookings() {
  const t = useTheme();
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api<{ bookings: Booking[] }>("/bookings")).bookings);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load your bookings.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    setBusy(true);
    try {
      await api(`/bookings/${id}/cancel`, { body: {} });
      setMsg("Booking cancelled.");
      setConfirm(null);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = (rows ?? []).filter((b) => b.status === "confirmed" && new Date(b.end).getTime() > now);
  const past = (rows ?? []).filter((b) => !upcoming.includes(b)).reverse().slice(0, 20);
  const item = (b: Booking, canCancel: boolean) => {
    const [label, kind] = STATUS[b.status];
    return (
      <Card key={b.id} style={{ borderLeftWidth: 6, borderLeftColor: labColour(t, b.resourceColour) }}>
        <View style={s.row}><T weight="700">{b.resourceName}</T><Tag label={label} kind={kind} /></View>
        <T size={15}>{fmtShort(b.date)} · {b.blockLabel} · {b.timeLabel}</T>
        <T size={14} colour={t.text2}>{b.classLabel} · {b.subject} · with {b.inchargeName}{b.cartCount ? ` · ${b.cartCount} carts to ${b.classroom}` : ""}</T>
        {canCancel && (
          <View style={[s.row, { marginTop: 10 }]}>
            {confirm === b.id ? (
              <>
                <Button label="Yes, cancel" kind="danger" busy={busy} onPress={() => cancel(b.id)} />
                <Button label="Keep it" onPress={() => setConfirm(null)} />
              </>
            ) : (
              <Button label="Cancel booking" onPress={() => { setMsg(null); setConfirm(b.id); }} />
            )}
          </View>
        )}
      </Card>
    );
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <H>My bookings</H>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="bad">{err}</Notice>}
      <T size={18} weight="700" role="header" style={{ marginBottom: 8 }}>Upcoming</T>
      {rows && upcoming.length === 0 && <T colour={t.text2} style={{ marginBottom: 12 }}>No upcoming bookings.</T>}
      {upcoming.map((b) => item(b, true))}
      <T size={18} weight="700" role="header" style={{ marginVertical: 8 }}>Past and cancelled</T>
      {rows && past.length === 0 && <T colour={t.text2}>Nothing yet.</T>}
      {past.map((b) => item(b, false))}
    </ScrollView>
  );
}
