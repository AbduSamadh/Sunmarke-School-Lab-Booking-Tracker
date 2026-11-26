import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View, useColorScheme } from "react-native";
import { signIn, ApiError } from "../api";
import type { Actor } from "../types";
import { Button, Field, Notice, T } from "../ui";

/**
 * Sign-in matches the website's pilot sign-in (school email). When Fortes IT
 * switches on Google / Microsoft sign-in, this screen gets the same SSO buttons.
 */
export function SignIn({ onDone }: { onDone: (a: Actor) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dark = useColorScheme() === "dark";
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      onDone(await signIn(email.trim()));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          {/* The supplied logo files, unchanged. */}
          <Image source={dark ? require("../../assets/logo-dark.png") : require("../../assets/logo.png")} style={{ width: 220, height: 80 }} resizeMode="contain" accessibilityLabel="Sunmarke School" />
        </View>
        <T size={26} weight="700" role="header" style={{ textAlign: "center", marginBottom: 6 }}>Lab booking</T>
        <T colour={undefined} style={{ textAlign: "center", marginBottom: 20 }}>Sign in with your school email.</T>
        {err && <Notice kind="bad">{err}</Notice>}
        <Field label="School email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="go" onSubmitEditing={go} />
        <Button label="Sign in" kind="primary" onPress={go} busy={busy} disabled={!email.includes("@")} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
