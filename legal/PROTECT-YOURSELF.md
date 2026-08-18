# Protecting your position — practical checklist

_For Veer. Internal, not for the client._

---

## Read this first — the app is NOT deployed yet

This is the single most important fact on this page, and it is temporary.

| Piece | Where it is | Who controls it |
|---|---|---|
| Supabase — database, RLS, every function, **all student data** | Live | **You** |
| The Next.js application | Your machine + your private GitHub | **You** |
| Vercel hosting | **Does not exist yet** | Nobody |
| Amazon SES — email delivery | Client's AWS | Client |
| Razorpay — payments and bank link | Client's | Client |
| Domain and DNS | Client's registrar | Client |

**Neither side can operate alone.** You hold the code and the data; they hold
the money rails, the email and the domain. That is a mutual dependency, not a
one-sided grip.

The client cannot run their business on any of this today. Nothing is deployed.
**That is your negotiating position, and it disappears the moment you deploy.**

---

## Read this part twice: the data is a liability, not an asset

Roughly 200 students' names, email addresses, enrolment records and payment
history will sit in **your personal Supabase account**. That feels like
leverage. Treat it as the opposite.

**Under India's Digital Personal Data Protection Act, 2023**, the client is the
Data Fiduciary (they decide why the data is collected) and you are the Data
Processor (you hold and process it on their instructions). That carries real
obligations: security safeguards, breach reporting, and deletion when
instructed. Those apply to you personally, because the account is in your name.

Three consequences worth thinking about before you get comfortable:

1. **A breach is yours.** If that database leaks, the exposure lands on the
   account holder. Not on the client.
2. **Withholding it is not an option.** If a dispute ever arises, refusing to
   hand over student data is not leverage — it is a Data Processor refusing a
   lawful instruction from the Fiduciary, and it converts a billing argument
   into a regulatory one you would lose.
3. **It is a single point of failure for their business.** If you lose access to
   your own account, their entire operation stops. Any competent adviser will
   tell them not to accept that, and they would be right.

### What to do about it

**Before signing:** leave it as it is. It is fine for a pre-launch project and
you should not weaken your position while terms are unsettled.

**After signing:** transfer the Supabase project into an organisation owned by
the client, and add yourself as an Owner/Admin member. Supabase supports moving
a project between organisations, so this costs you nothing operationally.

You keep full administrative access — you can still do every piece of the work.
What changes is that the data lives where it legally belongs, the client is no
longer betting their business on one person's login, and you stop personally
holding 200 students' personal information.

You lose nothing real. Your protection was never the data; it is the code and
the agreement.

---

## The one thing to do before anything else

**Do not deploy until the agreement is signed.**

Not "deploy and then send the agreement". Not "deploy so they can see it working
and then discuss terms". Once it is live and their students are using it,
raising IP terms looks like a hostage demand, and you will fold, because you
will not want to take a working platform away from a real business.

The conversation to have, before deployment:

> "Everything is built and tested. Before I put it live I want us to have the
> support arrangement in writing — what I fix, how fast, who pays for hosting,
> and what happens if I'm ever unavailable. I'll send it over today and we can
> go live as soon as it's signed."

That is a completely normal request, at a completely normal moment. It is
neither aggressive nor unusual. **This is the moment. There is not another
one.**

---

## Do these, in this order

### 1. Get the agreement signed — this week

Nothing else matters as much. Until it is signed, there is no written record
that the ₹50,000 bought a licence rather than the code, and the default reading
of an unwritten deal tends to favour the person who paid.

Do this **before** any further free work. Once the 12-month support period is
underway it is much harder to introduce terms.

Send `CLIENT-SUMMARY.md` first, then the agreement. Frame it as filling a gap,
not as new conditions:

> "We never put anything in writing about support and maintenance — who fixes
> what, response times, who pays the AWS bill. I've drafted something so we both
> know where we stand. It also covers what happens if I'm ever unavailable."

That is true, and it is a document they benefit from.

### 2. Create the Vercel account in YOUR name

Nobody has one yet, so this is a free choice rather than a renegotiation. Take
it.

**Deploy to your own Vercel account and point their domain at it.** The client
gets a working site at `app.forensicbypriyanshi.com` and never touches the
application code. They keep Supabase, SES and Razorpay — which they already
have — and you keep the part that is still yours.

This is not obstruction. It is how nearly every agency hosts client work.

#### The cost problem, honestly

Vercel's free Hobby tier **prohibits commercial use**. A business site needs
Vercel Pro at $20/month — roughly **₹1,700**.

Which means:

| | |
|---|---|
| You charge | ₹1,000/month |
| Vercel Pro costs you | ₹1,700/month |
| **You lose** | **₹700/month** |

So one of these has to change:

- **Raise the support fee to ₹3,000/month** — covers hosting with margin, and is
  still very cheap for a managed platform. This is the right answer.
- **Bill hosting separately at cost + 15%** — ₹1,000 support + ~₹2,000 hosting.
- **Let the client hold Vercel** — you save the cost and fall back to
  contractual protection only (Clause 8.6).

Do not run the third option *and* charge ₹1,000. That combination gives you
neither the money nor the control.

#### If they already insist on holding Vercel

Fine — take it, and rely on the agreement. Clause 8.6 exists for exactly that
case. Just be clear with yourself that at that point the protection is a
document, not a lock.

### 3. Keep the repository private and yours

Already true — it is under `VeerBhanushali/FSP_WEBAPP`. Keep it that way:

- Never add the client as a collaborator
- Never transfer the repo to their org
- If Vercel is Git-connected, it can deploy without them having repo access

### 4. Leave production source maps off

Currently off, which is the Next.js default. Never set
`productionBrowserSourceMaps: true` — it would publish readable client source to
anyone who opens devtools.

Server code never reaches the browser, so the entire data layer, RLS logic and
API routes are already invisible from the front end.

### 5. Consider registering the copyright

Copyright exists automatically in India from the moment of creation, so you
already hold it. Registration with the Copyright Office is optional but gives
you a dated certificate, which is far easier to rely on in a dispute than
"here's my git history".

Roughly ₹500–5,000 and a few months. Worth it if this becomes a product you
licence to more than one client.

### 6. Take a deposit next time

The structural fix for all of this:

- 40% upfront, 40% at staging, **20% before production deploy**
- IP clause in the proposal, before any code is written
- Written scope with a change-request rate

On this project you still have the final milestone available, because nothing is
live yet. Use it. "Sign the support agreement and settle any balance, and I'll
deploy this week" is a reasonable, professional thing to say.

---

## What actually keeps the client

Blunt version: the code is not the moat.

A competent developer can rebuild a UI in a few weeks. What is genuinely hard to
replace is knowing *why* the row-level security is shaped the way it is, why
enrolment follows the webhook rather than the browser, why the Meet URL is
column-revoked. That knowledge is in your head and in the docs you wrote.

The client stays because:

1. **Nobody else can operate it cheaply.** A ₹15k/month maintenance developer
   cannot take this over. That is a real barrier, and it only works if you are
   also worth what you charge.
2. **Switching is expensive and risky** — SES production access re-approval,
   DKIM re-verification, Razorpay reconfiguration, data migration. Weeks of
   disruption to save a small monthly fee.
3. **You are responsive.** The cheapest retention there is.

---

## The uncomfortable truth about ₹1,000/month

₹12,000 a year is below the cost of the infrastructure it runs on. If Supabase
or Vercel move past their free tiers, the client's own bill will exceed your
support fee.

That is fine as a goodwill rate for a first client, and it may be exactly right
for the relationship. Just be clear with yourself that it is a **relationship
rate, not a business rate** — and that a second client at the same price is not
a business.

For the next one: ₹4,000–6,000/month, or 18–20% of the build value annually.

---

## If it goes wrong

If they take the code and hire someone else:

1. **Do not threaten first.** Ask what happened. Most of these are
   misunderstandings about what was agreed.
2. **Written notice** citing the licence and the specific breach.
3. **A lawyer's notice** costs ₹5,000–15,000 and resolves most disputes at that
   stage.
4. **Court** is a last resort — realistically not worth it for ₹50,000 unless
   there is a principle or a bigger contract behind it.

Keep your evidence in order: the git history with timestamps, this repository
under your account, the LICENSE file, and any signed agreement. That is a strong
paper trail already.
