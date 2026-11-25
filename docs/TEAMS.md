# Teams messages

abd, 25 Nov 2026: booking messages go to Microsoft Teams instead of email.

## What is sent
Every message the app used to email now goes to the person in Teams as a card, with the details and a button back to the app:
- Teacher and every in-charge going (for AI Carts, one per cart): booked, changed, cancelled, declined, reminder, "rate your session".
- Waitlist offers, uncovered bookings, high-severity equipment problems (admin), the in-charge daily list and the weekly report (admin and leadership).
- Phone app notifications (when switched on) carry the same news.

Until Teams is connected, every message is kept on the **Messages** page (admin and in-charges) so the pilot can be tried with nothing leaving the app.

## Connecting it (one Teams workflow, no Azure app needed)
Someone with Teams in the school's Microsoft 365 (Fortes IT, or abd if allowed) does this once:
1. In Teams, open **Workflows** and create a flow from **When a Teams webhook request is received**. Set who can trigger it to **Anyone** (the link itself is the secret).
2. Add **Post card in a chat or channel**: Post as **Flow bot**, Post in **Chat with Flow bot**, Recipient = `triggerBody()?['to']`, Adaptive Card = `triggerBody()?['card']`.
3. Save, copy the webhook link, and set it on the server as `TEAMS_WORKFLOW_URL`. Never put it in the code.

The app posts `{ "to": "<school email>", "subject": "...", "text": "...", "card": { Adaptive Card 1.4 } }`. A failed post is marked "not delivered" on the Messages page and retried by the job runner.

To go back to email (once a sending account exists), set `NOTIFY_CHANNEL=email`.

## Notes
- Staff emails in the app must match their Teams (Microsoft 365) sign-in, or the Flow bot cannot find them.
- Calendar invites (.ics) were attached to emails. Teams cards cannot carry them; the calendar adapter (waiting on Fortes IT) will put sessions straight into calendars.
- The workflow runs under the account that created it; use a shared service account if possible, so it does not stop when one person leaves.
