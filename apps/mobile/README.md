# Sunmarke Lab Booking: phone app

An Expo (React Native) app for iOS and Android. It uses the same `/api/v1` as the website, so every booking still goes through the rules engine on the server.

## What it does
- **Book**: pick a day and a lab, see free periods, book. A blocked booking shows the reason and nearby free slots.
- **Mine**: upcoming and past bookings, with cancel (the server applies the cut-off).
- **Sessions** (in-charges and admins): today and tomorrow in your labs, with Attended / No-show.
- **Check in**: scan the QR code on the lab door, or type the code.
- **Notifications**: the phone registers for push after sign-in. The server only sends them when `PUSH_PROVIDER=expo` is set; until then they go to the email outbox like everything else.

## Run it
```
pnpm install
EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:3000 pnpm --filter mobile start
```
Open it in Expo Go, or build a dev client. The web app must be running (`pnpm dev`).

## Before it goes to the App Store or Play Store
- School developer accounts (Apple and Google), owned by Sunmarke or Fortes, not a person.
- Google / Microsoft sign-in (same as the website); the email-only pilot sign-in must not ship.
- An EAS project id in `app.json` (`extra.eas.projectId`) for push tokens.
- The real server URL in `extra.apiUrl`.

Sign-in tokens are stored in the phone's Keychain / Keystore (expo-secure-store) and expire after 30 days.
