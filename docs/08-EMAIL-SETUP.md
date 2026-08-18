# Email setup — Amazon SES

_Region: `ap-south-1` (Mumbai). Plan: Essentials. Sending domain: `fspmail.forensicbypriyanshi.com`._

Email is the **only** authentication channel on this platform — no password, no SMS. An undelivered message is a locked-out student, so this document is worth following exactly rather than approximately.

---

## You need TWO different credentials

This is the step people get wrong. They are not interchangeable.

| | Used by | Looks like | Created in |
|---|---|---|---|
| **SMTP credentials** | Supabase Auth, for sign-in codes | username `AKIA…` + a long password | SES Console → SMTP settings |
| **IAM access key** | This app, for reminders and receipts | key id `AKIA…` + secret | IAM Console → Users |

Both start with `AKIA`, which is exactly why they get confused. The SMTP password is **derived** from an IAM secret by a signing algorithm — you cannot paste an IAM secret into an SMTP password field and expect it to work.

---

## 1 · SMTP credentials → Supabase

Without this, Supabase falls back to its built-in mailer, which is throttled to a few messages an hour. **No student can sign up until this is done.**

1. SES Console → left nav → **SMTP settings**
2. **Create SMTP credentials** → give the IAM user a name like `fsp-smtp` → Create
3. **Download the CSV.** The password is shown once and cannot be retrieved later.

Then Supabase → **Project Settings → Authentication → SMTP Settings**:

| Field | Value |
|---|---|
| Enable Custom SMTP | on |
| Sender email | `no-reply@fspmail.forensicbypriyanshi.com` |
| Sender name | `Forensic Science by Priyanshi` |
| Host | `email-smtp.ap-south-1.amazonaws.com` |
| Port | `587` |
| Username | SMTP username from the CSV |
| Password | SMTP password from the CSV |
| Minimum interval between emails | `10` seconds |

Port 587 uses STARTTLS. Port 465 also works if 587 is blocked; port 25 is often blocked by hosts and should be avoided.

> The sender address **must** be on the verified domain. `no-reply@forensicbypriyanshi.com` will be rejected — only `…@fspmail.forensicbypriyanshi.com` is verified.

---

## 2 · IAM access key → Vercel

This is what the app itself uses for class reminders, receipts and notifications.

1. IAM Console → **Users** → **Create user** → name it `fsp-ses-app`
2. Permissions → **Attach policies directly** → `AmazonSESFullAccess`
3. Create the user, open it → **Security credentials** → **Create access key**
4. Use case: **Application running outside AWS**
5. Copy the **Access key ID** and **Secret access key** — the secret is shown once

Never use root credentials, and never attach a broader policy "to be safe". This key only needs to send email.

Then Vercel → Settings → Environment Variables → `EMAIL_POOLS`, as one line:

```json
[{"id":"ses","provider":"ses","region":"ap-south-1","key":"AKIA…","secret":"…","from":"no-reply@fspmail.forensicbypriyanshi.com","dailyCap":2000,"monthlyCap":50000,"priority":0}]
```

`dailyCap` and `monthlyCap` are a **spend guard**, not a provider limit — SES has no free-tier ceiling to hit. They exist so a runaway loop stops rather than bills you.

---

## 3 · Production access — do this first, not last

**Every new SES account is sandboxed:**

- can only send **to addresses you have verified**
- **200 emails a day**, 1 per second

So it works perfectly in your own testing and fails for every real student. This is the single most common way an SES launch goes wrong.

SES Console → **Account dashboard** → **Request production access**.

What to tell them, all of which is true here:

> Transactional email only — one-time sign-in codes and class reminders — sent to students who registered directly on our platform. No purchased or rented lists. Bounces and complaints are processed via SES notifications and added to a suppression list automatically. Expected volume ~5,000/month.

Approval is usually a few hours to a day.

---

## 4 · Verify it works

After DNS verification shows **Verified** and production access is granted:

1. Register a test account on the platform. The code should arrive within seconds.
2. Check `/admin/emails` — the send should appear against the `ses` pool with today's count incremented.
3. Check the SES Console → Account dashboard for bounce and complaint rates.

If mail does not arrive, in this order:

| Symptom | Cause |
|---|---|
| SES shows the send, inbox empty | Check spam. Then check DMARC alignment. |
| "Email address not verified" | Still in the sandbox, or the From domain is not `fspmail.` |
| "Signature does not match" | Wrong secret, or region mismatch between the key and `region` |
| Nothing in `email_log` at all | `EMAIL_POOLS` is malformed — the app logs `EMAIL_POOLS is not valid JSON` and falls back |

---

## DNS records this depends on

All on Cloudflare, all **DNS only** — never proxied. Proxying a DKIM record replaces the target with Cloudflare's IP and breaks verification.

```
3 ×  <token>._domainkey.fspmail   CNAME  <token>.dkim.amazonses.com
     bounce.fspmail               MX     feedback-smtp.ap-south-1.amazonses.com  (10)
     bounce.fspmail               TXT    v=spf1 include:amazonses.com ~all
     _dmarc.fspmail               TXT    v=DMARC1; p=none;
```

Separately, the **root** domain carries Google Workspace mail and must not be confused with the above:

```
     @                            MX     smtp.google.com  (1)
     @                            TXT    v=spf1 include:_spf.google.com ~all
```

> Two SPF records on the same name is a permanent error. There must be exactly one TXT starting `v=spf1` per hostname.

---

## Costs

Essentials is **$0.16 per 1,000 emails** with no monthly fee.

| Students | Emails/month | Monthly |
|---|---|---|
| 200 | ~5,400 | **₹76** |
| 500 | ~13,500 | ₹190 |
| 2,000 | ~54,000 | ₹760 |

No dedicated IP (+$25/mo), no VDM, no attachment transfer — lessons are Drive links, so nothing is attached.

---

## When to add a second provider

Not yet. But if SES is ever suspended or throttled, sign-in stops for everyone, so the app supports a fallback pool at a **different company**:

```json
{"id":"backup","provider":"brevo","key":"xkeysib-…",
 "from":"no-reply@fspmail.forensicbypriyanshi.com",
 "dailyCap":300,"monthlyCap":9000,"priority":9}
```

Priority 9 means it only sees traffic when SES fails. Brevo's free tier is 300/day, which covers sign-in codes indefinitely — enough to keep students able to log in while a problem is sorted out.

---

## Bounce and complaint reporting (SNS)

**You can skip this and everything still works.** AWS suppresses hard bounces on its own account-level list whether or not we ever hear about them. What you lose by skipping it is *visibility*: Support answers "I never got my code" with a guess, and `/admin/emails` shows a suppression list that is missing everyone SES quietly dropped.

Fifteen minutes, once.

### 1 · Create the topic

AWS console → **SNS** → Topics → **Create topic**.

| Field | Value |
|---|---|
| Type | **Standard** (FIFO is not supported for SES notifications) |
| Name | `fsp-ses-events` |

Leave everything else alone and create it. **Copy the ARN** from the top of the page — it looks like `arn:aws:sns:ap-south-1:123456789012:fsp-ses-events`.

### 2 · Put the ARN in Vercel first

Vercel → your project → Settings → Environment Variables:

```
SES_SNS_TOPIC_ARNS = arn:aws:sns:ap-south-1:123456789012:fsp-ses-events
```

Redeploy. **Do this before step 3.** The endpoint refuses every message from a topic it does not recognise, including the subscription confirmation — so subscribing first just fails, confusingly.

### 3 · Subscribe the app

SNS → your topic → **Create subscription**.

| Field | Value |
|---|---|
| Protocol | **HTTPS** |
| Endpoint | `https://app.forensicbypriyanshi.com/api/webhooks/ses` |
| Raw message delivery | **Off** — the app needs the SNS envelope to verify the signature |

Create it. The status will say "Pending confirmation" for a few seconds and then flip to **Confirmed** on its own: SNS posts a confirmation message, the app verifies the signature, checks the ARN against what you set in step 2, and follows the confirmation link.

If it stays pending, the ARN in Vercel does not match, or the deployment has not picked it up yet.

### 4 · Point SES at the topic

SES → **Configuration** → **Identities** → `fspmail.forensicbypriyanshi.com` → **Notifications** tab → **Edit** the feedback notifications.

| Feedback type | Topic |
|---|---|
| Bounce | `fsp-ses-events` |
| Complaint | `fsp-ses-events` |
| Delivery | `fsp-ses-events` (optional — useful, higher volume) |

Save.

### 5 · Check it

SES → **Virtual Deliverability Manager** is not needed for this. Instead use the mailbox simulator, which does not affect your reputation:

Send a test to `bounce@simulator.amazonses.com`. Within a minute, `/admin/emails` should list that address as suppressed with reason **hard bounce**.

`complaint@simulator.amazonses.com` does the same for complaints. `success@simulator.amazonses.com` delivers normally.

### What the endpoint refuses, and why

| Check | Rejects | Why it exists |
|---|---|---|
| Certificate host | Anything not `sns.<region>.amazonaws.com` | The cert URL is inside the message, which the sender controls. Fetching it blindly means verifying an attacker's signature against an attacker's certificate — a check that always passes |
| Signature | Altered or unsigned messages | Proves it came from SNS |
| Topic ARN | Any topic not in `SES_SNS_TOPIC_ARNS` | Proves it came from **our** SNS. A stranger's topic produces a perfectly valid AWS signature |

Only **permanent** bounces suppress. A transient bounce is a full mailbox or a greylist, and suppressing on those would lock people out over a temporary condition at their own provider.

### Releasing a suppression

A student who fixed their mailbox is still suppressed. `/admin/emails` has a **Release** button per address. That clears our list only — if SES suppressed them at the account level too, clear it in SES → Suppression list.
