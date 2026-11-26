import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { api, ApiError } from "../api";
import { addDays, fmtShort, today } from "../dates";
import { labColour } from "../theme";
import type { Booking } from "../types";
import { Button, Card, H, Notice, T, Tag, s, useTheme } from "../ui";

/** In-charge view: today's and tomorrow's sessions in your labs, with attendance. */
export function Today() {
  const t = useTheme();
  const d0 = today();
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api<{ bookings: Booking[] }>(`/bookings?as=incharge&from=${d0}&to=${addDays(d0, 1)}`)).bookings);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load sessions.");
    } finally {
      setLoading(false);
    }
  }, [d0]);
  useEffect(() => { load(); }, [load]);

  async function mark(id: string, status: "completed" | "no_show") {
    setBusy(id);
    try {
      await api(`/bookings/${id}/attendance`, { body: { status } });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  const days = [d0, addDays(d0, 1)];
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <H>My sessions</H>
      {err && <Notice kind="bad">{err}</Notice>}
      {days.map((d, i) => {
        const list = (rows ?? []).filter((b) => b.date === d);
        return (
          <View key={d} style={{ marginBottom: 12 }}>
            <T size={18} weight="700" role="header" style={{ marginBottom: 8 }}>{i === 0 ? "Today" : "Tomorrow"}, {fmtShort(d)}</T>
            {rows && list.length === 0 && <T colour={t.text2}>No sessions.</T>}
            {list.map((b) => {
              const started = new Date(b.start).getTime() <= Date.now();
              return (
                <Card key={b.id} style={{ borderLeftWidth: 6, borderLeftColor: labColour(t, b.resourceColour) }}>
                  <View style={s.row}>
                    <T weight="700">{b.blockLabel} · {b.timeLabel}</T>
                    {b.status === "completed" && <Tag label="Attended" kind="ok" />}
                    {b.status === "no_show" && <Tag label="No-show" kind="bad" />}
                  </View>
                  <T size={15}>{b.resourceName} · {b.teacherName}</T>
                  <T size={14} colour={t.text2}>{b.classLabel} · {b.subject} · {b.studentCount} students{b.cartCount ? ` · ${b.cartCount} carts to ${b.classroom}` : ""}</T>
                  {b.status === "confirmed" && started && (
                    <View style={[s.row, { marginTop: 10 }]}>
                      <Button label="Attended" kind="primary" busy={busy === b.id} onPress={() => mark(b.id, "completed")} />
                      <Button label="No-show" disabled={busy === b.id} onPress={() => mark(b.id, "no_show")} />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}
