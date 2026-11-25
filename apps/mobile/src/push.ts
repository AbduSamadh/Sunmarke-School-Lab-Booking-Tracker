import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registered: string | null = null;

/**
 * Ask once for permission, then send this phone's Expo push token to the server
 * (POST /api/v1/devices). The server only sends pushes when the school turns on
 * PUSH_PROVIDER=expo; until then they appear in the email outbox.
 */
export async function registerForPush(): Promise<"on" | "denied" | "unsupported"> {
  if (!Device.isDevice) return "unsupported";
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("bookings", { name: "Bookings", importance: Notifications.AndroidImportance.DEFAULT });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "denied";
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api("/devices", { body: { token: data, platform: Platform.OS === "ios" ? "ios" : "android" } });
  registered = data;
  return "on";
}

export async function unregisterPush() {
  if (!registered) return;
  await api("/devices", { method: "DELETE", body: { token: registered } }).catch(() => undefined);
  registered = null;
}
