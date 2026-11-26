import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { api, ApiError } from "../api";
import { fmtShort, dayName, schoolWeek, today } from "../dates";
import { labColour } from "../theme";
import type { CellView, GridBlock, GridData, GridResource } from "../types";
import { Button, Card, Field, H, Notice, T, Tag, s, useTheme } from "../ui";

interface Alt { resourceId: string; resourceName: string; date: string; blockId: string; blockCode: string; inchargeName: string }
type Result = { ok: true; id: string } | { ok: false; reason: string; suggestion?: string; alternatives: Alt[] };

/** Find a free slot and book it. The rules engine on the server decides what is free; the app only shows it. */
export function Book() {
  const t = useTheme();
  const week = schoolWeek(today());
  const [date, setDate] = useState(week.includes(today()) ? today() : week[0]);
  const [grid, setGrid] = useState<GridData | null>(null);
  const [lab, setLab] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<{ resource: GridResource; block: GridBlock; date: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const g = await api<GridData>(`/availability?from=${week[0]}&to=${week[4]}`);
      setGrid(g);
      setLab((l) => l ?? g.resources[0]?.id ?? null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load the timetable.");
    } finally {
      setLoading(false);
    }
  }, [week[0]]);
  useEffect(() => { load(); }, [load]);

  if (pick) return <BookForm {...pick} onClose={(msg) => { setPick(null); setDone(msg); if (msg) load(); }} onPickAlt={(a) => {
    const r = grid?.resources.find((x) => x.id === a.resourceId);
    const b = grid?.days.find((d) => d.date === a.date)?.blocks.find((x) => x.id === a.blockId);
    if (r && b) setPick({ resource: r, block: b, date: a.date });
  }} />;

  const day = grid?.days.find((d) => d.date === date);
  const res = grid?.resources.find((r) => r.id === lab);
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <H>Book a lab</H>
      {done && <Notice kind="ok">{done}</Notice>}
      {err && <Notice kind="bad">{err}</Notice>}
      <View style={[s.row, { marginBottom: 12 }]} accessibilityRole="tablist" accessibilityLabel="Day">
        {week.map((d) => (
          <Chip key={d} on={d === date} label={dayName(d)} a11y={fmtShort(d)} onPress={() => setDate(d)} />
        ))}
      </View>
      <View style={[s.row, { marginBottom: 16 }]} accessibilityRole="tablist" accessibilityLabel="Lab">
        {grid?.resources.map((r) => (
          <Chip key={r.id} on={r.id === lab} label={r.name} dot={labColour(t, r.colour)} onPress={() => setLab(r.id)} />
        ))}
      </View>
      {day && res ? (
        day.blocks.length === 0 ? (
          <Notice>No lessons on {fmtShort(date)}{day.timetableName ? "" : " (school closed)"}.</Notice>
        ) : (
          day.blocks.map((b) => <Slot key={b.id} block={b} cell={day.cells[res.id]?.[b.id]} onBook={() => { setDone(null); setPick({ resource: res, block: b, date }); }} />)
        )
      ) : !err ? (
        <T colour={t.text2}>Loading…</T>
      ) : null}
    </ScrollView>
  );
}

function Chip({ label, on, onPress, dot, a11y }: { label: string; on: boolean; onPress: () => void; dot?: string; a11y?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6,
        borderColor: on ? t.accent : t.lineStrong, backgroundColor: on ? t.accent : t.surface }}
    >
      {dot && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />}
      <T size={15} weight="600" colour={on ? t.onAccent : t.text}>{label}</T>
    </Pressable>
  );
}

function Slot({ block, cell, onBook }: { block: GridBlock; cell?: CellView; onBook: () => void }) {
  const t = useTheme();
  const time = `${block.code} · ${block.start}–${block.end}`;
  if (!cell || cell.kind === "closed")
    return <Card><T weight="600">{time}</T><T size={14} colour={t.text2}>{cell?.label ?? "Not bookable"}</T></Card>;
  if (cell.kind === "booked")
    return (
      <Card>
        <View style={s.row}><T weight="600">{time}</T>{cell.mine ? <Tag label="Yours" kind="ok" /> : <Tag label="Booked" />}</View>
        <T size={14} colour={t.text2}>{cell.label}</T>
      </Card>
    );
  if (cell.kind === "unavailable")
    return (
      <Card>
        <View style={s.row}><T weight="600">{time}</T><Tag label="Unavailable" kind="warn" /></View>
        <T size={14} colour={t.text2}>{cell.reason}{cell.suggestion ? ` ${cell.suggestion}` : ""}</T>
      </Card>
    );
  return (
    <Card>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <View style={{ flexShrink: 1 }}>
          <View style={s.row}><T weight="600">{time}</T><Tag label="Free" kind="ok" /></View>
          <T size={14} colour={t.text2}>
            With {cell.inchargeName}{cell.crossCover ? " (cover)" : ""}{cell.unitsTotal > 1 ? ` · ${cell.unitsLeft} of ${cell.unitsTotal} carts left` : ""}
          </T>
        </View>
        <Button label="Book" kind="primary" onPress={onBook} hint={`Book ${time}`} />
      </View>
    </Card>
  );
}

function BookForm({ resource, block, date, onClose, onPickAlt }: { resource: GridResource; block: GridBlock; date: string; onClose: (msg: string | null) => void; onPickAlt: (a: Alt) => void }) {
  const t = useTheme();
  const carts = resource.type === "cart_pool";
  const [f, setF] = useState({ subject: "", yearGroup: "", section: "", studentCount: "", cartCount: "1", classroom: "", objective: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Extract<Result, { ok: false }> | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function submit() {
    setBusy(true);
    setErr(null);
    setBlocked(null);
    try {
      const r = await api<Result>("/bookings", {
        body: {
          resourceId: resource.id, date, blockIds: [block.id], subject: f.subject, yearGroup: f.yearGroup, section: f.section,
          studentCount: Number(f.studentCount), objective: f.objective,
          ...(carts ? { cartCount: Number(f.cartCount), classroom: f.classroom } : {}),
        },
      });
      if (r.ok) onClose(`Booked ${resource.name}, ${fmtShort(date)} ${block.code}.`);
      else setBlocked(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not book.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <H>{resource.name}</H>
      <T colour={t.text2} style={{ marginBottom: 16 }}>{fmtShort(date)} · {block.code} · {block.start}–{block.end}</T>
      {err && <Notice kind="bad">{err}</Notice>}
      {blocked && (
        <View>
          <Notice kind="warn">{blocked.reason}{blocked.suggestion ? ` ${blocked.suggestion}` : ""}</Notice>
          {blocked.alternatives.length > 0 && <T weight="600" style={{ marginBottom: 8 }}>Free nearby</T>}
          {blocked.alternatives.slice(0, 4).map((a) => (
            <View key={`${a.resourceId}-${a.date}-${a.blockId}`} style={{ marginBottom: 8 }}>
              <Button label={`${a.resourceName}, ${fmtShort(a.date)} ${a.blockCode}`} onPress={() => onPickAlt(a)} />
            </View>
          ))}
        </View>
      )}
      <Field label="Subject" value={f.subject} onChangeText={set("subject")} placeholder="e.g. Computing" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Year group" value={f.yearGroup} onChangeText={set("yearGroup")} placeholder="e.g. Y8" /></View>
        <View style={{ flex: 1 }}><Field label="Section" value={f.section} onChangeText={set("section")} placeholder="e.g. B" /></View>
      </View>
      <Field label="Students" value={f.studentCount} onChangeText={set("studentCount")} keyboardType="number-pad" />
      {carts && (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Carts" value={f.cartCount} onChangeText={set("cartCount")} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Classroom" value={f.classroom} onChangeText={set("classroom")} /></View>
        </View>
      )}
      <Field label="Lesson objective (optional)" value={f.objective} onChangeText={set("objective")} />
      <View style={{ gap: 8 }}>
        <Button label="Confirm booking" kind="primary" onPress={submit} busy={busy} disabled={!f.subject || !f.yearGroup || !f.studentCount || (carts && !f.classroom)} />
        <Button label="Back" kind="quiet" onPress={() => onClose(null)} />
      </View>
    </ScrollView>
  );
}
