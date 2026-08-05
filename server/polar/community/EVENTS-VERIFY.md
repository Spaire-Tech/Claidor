# Verifying community events notifications end-to-end

A literal recipe for confirming that creating an event + RSVP-ing
actually fires the right bell notifications and emails. Run after a
deploy that touches `polar/community/events_*` or
`polar/customer_notifications/*`.

If something silently failed for you, **start with §0**. The single
most common "I created an event and nothing happened" cause is
`EMAIL_SENDER=logger` in your env, which makes the email sender just
write to logs instead of calling Resend.


## 0. Sanity-check the environment

```bash
# In the API container or wherever the worker runs:
grep -E "^EMAIL_SENDER|^RESEND_API_KEY" .env  # or env | grep EMAIL_
```

| Value             | What it means                                                    |
| ----------------- | ---------------------------------------------------------------- |
| `EMAIL_SENDER=resend` + a key set | Real emails go out via Resend.                       |
| `EMAIL_SENDER=logger` (default)   | Emails are **only logged**, not sent. Dev mode.      |
| unset                              | Defaults to `logger`. No real email.                 |

On the **first email** sent after a worker boot, you'll see in the
worker logs:

```
email.send.actor_start  sender_class=ResendEmailSender   ← real send
email.send.actor_start  sender_class=LoggingEmailSender  ← no email
```

If you see `LoggingEmailSender` in production, fix the env before
debugging anything else.


## 1. Restart the worker after deploying

Dramatiq registers actors at boot. If you deploy new actors
(`community.event.rsvp_confirmed`, `community.event.announce`, etc.)
without restarting the worker, messages to those names go to the dead
letter queue and nothing happens.

```bash
# Whatever your worker process manager is — supervisor / docker / k8s.
# The marker that proves the new code is loaded:
grep "community.event.rsvp_confirmed" /var/log/polar-worker.log
```

You should see the actor module imported on boot. If you don't,
the worker is still on old code.


## 2. Create an event — confirm the chain fires

1. As an org owner, hit the `Create event` button in
   `/{org}/portal/courses/{courseId}/community` (events tab).
2. Fill in title + start time (any time in the future).
3. **Leave "Notify members" toggled on** (default).
4. Submit.

Then in the worker logs you should see, in this exact order:

```
community.event.create.enqueued        notify_on_publish=true
community.event.published.actor_start
community.event.published.fan_out      recipient_count=N
customer_notification.send_to_customer  bell_on=true email_on=true
customer_notification.bell_row_created
customer_notification.email_enqueued_via_row
email.send.actor_start                  sender_class=ResendEmailSender
community.event.schedule_reminders.actor_start
community.event.schedule_reminders.done  scheduled=3
```

**Failure modes and what they look like:**

| Log line | What it means | Fix |
|---|---|---|
| `community.event.published.skipped reason=notify_on_publish_false` | You unchecked the toggle in the create modal. | Re-create and leave it on. |
| `community.event.published.no_recipients recipient_count=0` | **Most common cause of "nothing happened."** No customers are enrolled in this course. Bell + email fan-out has nobody to send to. | Enrol a test customer first. |
| `community.event.published.actor_start` never appears | The actor isn't registered. Worker is on old code. | Restart the worker. |
| `customer_notification.send_to_customer bell_on=false` | The recipient has the bell channel muted in their portal prefs. | Toggle bell back on for that customer. |
| `customer_notification.email_skipped reason=customer_email_prefs_off` | Customer turned off email in their portal prefs. | Same — toggle in their prefs. |
| `email.send.actor_start sender_class=LoggingEmailSender` | Email was queued and "sent" — just to logs, not to a real mailbox. | Set `EMAIL_SENDER=resend` + `RESEND_API_KEY` and restart. |


## 3. RSVP — confirm the confirmation email + .ics fire

1. From an enrolled customer's portal, open the event you just created.
2. Click **RSVP**.

Worker logs should show:

```
community.event.rsvp.applied            going=true was_going=false will_send_confirmation=true
community.event.rsvp_confirmed.actor_start
customer_notification.send_to_customer  type=community.event.rsvp_confirmed
customer_notification.bell_row_created
community.event.rsvp_confirmed.email_enqueued   to=<customer email>
email.send.actor_start                  sender_class=...  has_attachments=true
```

**Failure modes:**

| Log line | What it means |
|---|---|
| `community.event.rsvp.applied will_send_confirmation=false` | They were already going (or are toggling off). No confirmation re-sent on idempotent re-click. |
| `community.event.rsvp_confirmed.skipped reason=event_in_the_past` | The event's end time has already passed. Calendar invite would be useless. |
| `community.event.rsvp_confirmed.skipped reason=customer_not_found` | The customer ID from the session doesn't resolve. Auth/session issue. |
| `community.event.rsvp_confirmed.email_skipped reason=customer_has_no_email` | The customer row genuinely has no email column set. |
| `community.event.rsvp_confirmed.email_skipped reason=customer_email_prefs_off` | Customer email prefs are off. Bell still fires. |
| `community.event.rsvp_confirmed.actor_start` never appears | Worker on old code OR the rsvp endpoint didn't actually call enqueue_job. Check the `community.event.rsvp.applied` line — if THAT one is also missing, the rsvp endpoint itself failed (network / 4xx in the browser devtools). |


## 4. Check the bell row directly in the DB

If the worker logs say the bell row was created but the portal doesn't
show it:

```sql
SELECT id, customer_id, type, created_at, read_at
FROM customer_notifications
WHERE customer_id = '<uuid>'
ORDER BY created_at DESC
LIMIT 5;
```

If the row is there, the issue is the portal not subscribing to the
SSE stream or not refetching after a notification arrives — not the
notification pipeline.


## 5. Reminder emails (T-24h, T-15m, live)

You can't test these without time-travel, but you can confirm the
**scheduling** worked by creating an event ~25 hours from now. Right
after `community.event.create.enqueued` you should see:

```
community.event.schedule_reminders.actor_start
community.event.schedule_reminders.done  scheduled=3
```

`scheduled=3` means all three reminder windows were queued (24h, 15m,
live). `scheduled=2` means one window was already in the past (e.g.
you created an event 5 minutes from now — the T-24h window is skipped
because it'd already have fired).

To actually verify delivery without waiting, create an event ~16
minutes out — the T-15m reminder fires in ~1 minute. Or temporarily
shorten the windows in `schedule_reminders` for a test deploy.


## Quick "is anything broken?" one-liner

After creating an event + RSVP-ing in a course with at least one
other enrolled customer:

```bash
tail -n 200 /var/log/polar-worker.log | grep -E "community\.event\.|customer_notification\.|email\.send" | head -40
```

Should show ~15 log lines following the patterns above. If the chain
breaks somewhere, the missing line tells you where.
