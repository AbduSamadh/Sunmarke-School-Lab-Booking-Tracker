import { useState } from "react";
import { ScrollView, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api, ApiError } from "../api";
import { codeFromScan } from "../checkin";
import { Button, Field, H, Notice, T, useTheme } from "../ui";

type Res = { ok: true; resourceName: string; already: boolean } | { ok: false; resourceName: string; message: string };

/** Scan the QR code on the lab door to check your class in. Typing the code works without the camera. */
export function CheckIn() {
  const t = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ kind: "ok" | "warn" | "bad"; text: string } | null>(null);

  async function send(raw: string) {
    const c = codeFromScan(raw);
    setScanning(false);
    if (!c) return setRes({ kind: "bad", text: "That is not a lab check-in code." });
    setBusy(true);
    try {
      const r = await api<Res>("/checkin", { body: { code: c } });
      setRes(r.ok ? { kind: "ok", text: r.already ? `Already checked in to ${r.resourceName}.` : `Checked in to ${r.resourceName}. Have a good lesson.` } : { kind: "warn", text: r.message });
    } catch (e) {
      setRes({ kind: "bad", text: e instanceof ApiError ? e.message : "Could not check in." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <H>Check in</H>
      <T colour={t.text2} style={{ marginBottom: 12 }}>Scan the code on the lab door when your lesson starts. Check-in opens 15 minutes before.</T>
      {res && <Notice kind={res.kind}>{res.text}</Notice>}
      {scanning ? (
        <View style={{ height: 320, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy ? undefined : (e) => send(e.data)} accessibilityLabel="Camera viewfinder for the lab QR code" />
        </View>
      ) : null}
      <View style={{ gap: 8, marginBottom: 20 }}>
        {scanning ? (
          <Button label="Stop scanning" onPress={() => setScanning(false)} />
        ) : (
          <Button
            label="Scan lab code"
            kind="primary"
            busy={busy}
            onPress={async () => {
              setRes(null);
              if (!perm?.granted && !(await requestPerm()).granted) return setRes({ kind: "warn", text: "Camera access is off. Type the code under the QR instead." });
              setScanning(true);
            }}
          />
        )}
      </View>
      <Field label="Or type the code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => send(code)} />
      <Button label="Check in" onPress={() => send(code)} disabled={code.trim().length < 4} busy={busy} />
    </ScrollView>
  );
}
