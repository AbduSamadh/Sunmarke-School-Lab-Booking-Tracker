import { useEffect, useState } from "react";
import { Pressable, View, useColorScheme } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { loadToken, me, signOut } from "./src/api";
import { registerForPush, unregisterPush } from "./src/push";
import { dark, light } from "./src/theme";
import type { Actor } from "./src/types";
import { Button, Notice, T, ThemeCtx } from "./src/ui";
import { SignIn } from "./src/screens/SignIn";
import { Book } from "./src/screens/Book";
import { MyBookings } from "./src/screens/MyBookings";
import { Today } from "./src/screens/Today";
import { CheckIn } from "./src/screens/CheckIn";

type Tab = "book" | "mine" | "today" | "checkin" | "me";

export default function App() {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? dark : light;
  const [actor, setActor] = useState<Actor | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("book");
  const [push, setPush] = useState<"on" | "denied" | "unsupported" | null>(null);

  useEffect(() => {
    loadToken().then(me).then(setActor).catch(() => setActor(null));
  }, []);
  useEffect(() => {
    if (!actor) return;
    setTab(actor.role === "incharge" ? "today" : "book");
    registerForPush().then(setPush).catch(() => setPush("unsupported"));
    // Tapping a booking notification opens the matching list.
    const sub = Notifications.addNotificationResponseReceivedListener(() => setTab(actor.role === "incharge" ? "today" : "mine"));
    return () => sub.remove();
  }, [actor?.id]);

  const tabs: [Tab, string][] = actor
    ? [
        ...(actor.role !== "viewer" ? ([["book", "Book"]] as [Tab, string][]) : []),
        ...(actor.role !== "viewer" ? ([["mine", "Mine"]] as [Tab, string][]) : []),
        ...(actor.role === "incharge" || actor.role === "admin" ? ([["today", "Sessions"]] as [Tab, string][]) : []),
        ["checkin", "Check in"],
        ["me", "Account"],
      ]
    : [];

  return (
    <ThemeCtx.Provider value={theme}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right", "bottom"]}>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          {actor === undefined ? null : actor === null ? (
            <SignIn onDone={setActor} />
          ) : (
            <>
              <View style={{ flex: 1 }}>
                {tab === "book" && <Book />}
                {tab === "mine" && <MyBookings />}
                {tab === "today" && <Today />}
                {tab === "checkin" && <CheckIn />}
                {tab === "me" && (
                  <View style={{ padding: 16, gap: 12 }}>
                    <T size={22} weight="700" role="header">{actor.name}</T>
                    <T colour={theme.text2}>{actor.email} · {actor.department}</T>
                    {push === "on" && <Notice kind="ok">Booking notifications are on for this phone.</Notice>}
                    {push === "denied" && <Notice kind="warn">Notifications are off. Turn them on in your phone's settings to hear about changes.</Notice>}
                    <Button label="Sign out" onPress={async () => { await unregisterPush(); await signOut(); setActor(null); }} />
                  </View>
                )}
              </View>
              <View accessibilityRole="tablist" style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: theme.line, backgroundColor: theme.surface }}>
                {tabs.map(([id, label]) => (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === id }}
                    onPress={() => setTab(id)}
                    style={{ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", borderTopWidth: 3, borderTopColor: tab === id ? theme.accent : "transparent" }}
                  >
                    <T size={14} weight={tab === id ? "700" : "400"} colour={tab === id ? theme.accent : theme.text2}>{label}</T>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemeCtx.Provider>
  );
}
