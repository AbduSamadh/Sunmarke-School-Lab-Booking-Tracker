import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { light, type Theme } from "./theme";

export const ThemeCtx = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeCtx);

/** Body text. Sizes follow the web type scale; every size honours the phone's font scaling. */
export function T({ children, size = 16, weight, colour, style, role }: { children: ReactNode; size?: number; weight?: "400" | "600" | "700"; colour?: string; style?: object; role?: "header" | "alert" }) {
  const t = useTheme();
  return (
    <Text accessibilityRole={role} style={[{ fontSize: size, color: colour ?? t.text, fontWeight: weight ?? "400", lineHeight: Math.round(size * 1.4) }, style]}>
      {children}
    </Text>
  );
}

export function H({ children }: { children: ReactNode }) {
  return <T size={22} weight="700" role="header" style={{ marginBottom: 12 }}>{children}</T>;
}

/** Buttons have a 48 pt minimum touch target (WCAG 2.5.8 needs 24; platform guidance is 44 to 48). */
export function Button({ label, onPress, kind = "default", disabled, busy, hint }: { label: string; onPress: () => void; kind?: "primary" | "default" | "danger" | "quiet"; disabled?: boolean; busy?: boolean; hint?: string }) {
  const t = useTheme();
  const bg = kind === "primary" ? t.accent : kind === "danger" ? t.bad : kind === "quiet" ? "transparent" : t.surface;
  const fg = kind === "primary" ? t.onAccent : kind === "danger" ? t.surface : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === "default" ? t.lineStrong : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <T size={14} weight="600" style={{ marginBottom: 4 }}>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.text3}
        {...props}
        style={[s.input, { borderColor: t.lineStrong, color: t.text, backgroundColor: t.surface }]}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const t = useTheme();
  const [bg, fg] = kind === "ok" ? [t.okSoft, t.ok] : kind === "warn" ? [t.warnSoft, t.warn] : kind === "bad" ? [t.badSoft, t.bad] : [t.accentSoft, t.accent];
  return (
    <View accessibilityRole={kind === "bad" ? "alert" : undefined} accessibilityLiveRegion="polite" style={[s.notice, { backgroundColor: bg, borderLeftColor: fg }]}>
      <T size={15}>{children}</T>
    </View>
  );
}

export function Tag({ label, kind }: { label: string; kind?: "ok" | "warn" | "bad" }) {
  const t = useTheme();
  const [bg, fg] = kind === "ok" ? [t.okSoft, t.ok] : kind === "warn" ? [t.warnSoft, t.warn] : kind === "bad" ? [t.badSoft, t.bad] : [t.surface2, t.text2];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, alignSelf: "flex-start" }}>
      <T size={13} weight="600" colour={fg}>{label}</T>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  notice: { borderLeftWidth: 4, borderRadius: 8, padding: 12, marginBottom: 12 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
});
