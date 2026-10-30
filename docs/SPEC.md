---
title: "Knoxumi Platform Specification"
subtitle: "Knoxumi Accounts, Knoxumi Waiver, Knoxumi Admin (v1.3)"
date: "October 29, 2026"
---

# 1. Purpose of this document

This is the build specification for the Knoxumi platform. It is written to be handed to Claude Code (or any developer). It describes **what** to build and the **rules** it must follow. When a technology is named, it is a decision, not a suggestion.

Markers used in this document:

* **[DEFERRED]**: design for it now, but do not build it in the MVP.
* **[COMPANY SETTING]**: the behavior is configurable per account, and the stated default applies.
* **[ADMIN]**: only a Knoxumi admin can change it.

Knoxumi is a **multi-product SaaS platform**. Each business has **one Knoxumi account** and can subscribe to one or more Knoxumi products. The first product is **Knoxumi Waiver**: online liability waivers with signing, storage and check-in. More products will follow, so everything that is not waiver-specific (accounts, users, billing, plans, coupons, admin) is built as **platform** code that any product can use.

Areas covered:

1. **Platform**: accounts, users, authentication, billing, plans, coupons and tax (§4–§6, §13).
2. **Knoxumi Waiver**:
   * Visitor front end (§7).
   * Legal record and evidence (§8).
   * Company back end on web (§9).
   * Kiosk app (§10).
   * Business app (§11).
   * Retention and privacy (§12).
3. **Knoxumi Admin**: the internal console for running the platform (§14).
4. **Marketing site**: knoxumi.com and the product pages. **[DEFERRED]**: it gets a separate spec, and only the hooks it needs are defined here (§17).

# 2. Glossary

| Term | Meaning |
|---|---|
| Knoxumi | The company and the platform. |
| Account | A business customer of Knoxumi, such as an indoor play center. It has one public slug and one Stripe customer. In waiver screens it is called the "company". |
| Account user | A staff login that belongs to an account. Users are shared across all of the account's products. The default cap is 3 per account. |
| Product | A Knoxumi product. The first is Knoxumi Waiver (`waiver`). |
| Product subscription | An account's subscription to one product. Each has its own plan, its own Stripe subscription, its own trial and its own status. |
| Plan | A priced tier of a product, with limits (signed waivers per period and max users). |
| Admin | A Knoxumi staff user of the admin console. There is one admin in v1. |
| Visitor | A member of the public who signs waivers. Visitors have a global visitor account. |
| Waiver template | A waiver that an account builds in the form builder. It has many versions. |
| Waiver version | An immutable, published, date-stamped snapshot of a template. |
| Signed waiver (submission) | One completed submission by a visitor, covering one or more participants. |
| Participant | A person covered by a submission, such as the signer, a spouse or children. |
| Adult participant | A participant aged 18 or over. Each adult must sign before they can be checked in. |
| Revision | A new immutable record of a submission. One is created on every change, renewal or re-sign. |
| Signature event | One adult signing one revision. |
| Check-in | A record that a participant was admitted to the premises. |
| Billing period | A monthly period anchored on the product subscription's anniversary. Annual plans still have a monthly allowance. |
| Impersonation | The admin acting as an account user or a visitor. Every impersonation is fully audited. |

# 3. Domains, deployments & technology

## 3.1 Domains

Every deployed site is its **own Next.js app** with its own root directory and its **own Vercel project**. All of them come from the same GitHub monorepo.

| Domain | App (root directory) | Vercel project | Purpose |
|---|---|---|---|
| `knoxumi.com` (+ `www`) | `apps/marketing` | `knoxumi-marketing` | Marketing site for Knoxumi (the company) and product pages such as `/waiver` and `/pricing` **[DEFERRED]** |
| `app.knoxumi.com` | `apps/app` | `knoxumi-app` | The company back office for **all products**: one login, a product switcher, account settings (users, billing), and product areas such as `/waiver/...` and later `/scheduling/...`. Also hosts the **Business app API** (`/api/v1/*`), Stripe, Resend and Mailchimp **webhooks**, and the **cron/job routes** |
| `waiver.knoxumi.com` | `apps/waiver` | `knoxumi-waiver` | Public waiver signing: `/{companySlug}/{waiverSlug}`, `/{companySlug}`, visitor account pages, `/verify/{docId}`, the kiosk web app at `/kiosk`, and the **visitor and kiosk API** (`/api/v1/*`) used by the Kiosk app |
| `admin.knoxumi.com` | `apps/admin` | `knoxumi-admin` | Knoxumi admin console, with its own secrets and firewall rules |
| `scheduling.knoxumi.com` (later) | `apps/scheduling` | `knoxumi-scheduling` | Example of a future product's public site (§3.6) |

* Visitor sessions (`waiver.`), account-user sessions (`app.`) and admin sessions (`admin.`) all use **host-only cookies**, so no session cookie is ever shared between subdomains.
* No hostname-routing middleware is needed, because each domain maps to exactly one app.
* Apps link to each other only through **environment variables**, never hard-coded hostnames. The variables are:
  * `MARKETING_URL`, `APP_URL`, `WAIVER_URL`, `ADMIN_URL`
  * Later, one per product site (e.g. `SCHEDULING_URL`).
* Every app's Vercel project sets **Ignored Build Step** to `npx turbo-ignore`. A push then only rebuilds the apps whose own code or shared packages changed.
* Apps never call each other's internal routes to run business logic. They share logic through `packages/` and the shared database. The exceptions are the public APIs listed above and webhooks.

## 3.2 Technology decisions

| Concern | Decision |
|---|---|
| Web framework | Next.js (App Router, TypeScript). Use Server Actions for the web, and Route Handlers for the mobile API. |
| Hosting | Vercel. Use Vercel Cron for scheduled jobs and Vercel Firewall for admin IP rules. |
| Database | Neon (serverless Postgres). Use one database for the whole platform, and Neon branches for preview deployments. |
| ORM / migrations | Drizzle ORM, with SQL migrations kept in the repo. |
| Auth | Better Auth with **three separate realms**: visitor, account user and admin (§6). |
| Email | Resend with React Email templates. Mail is sent from a Knoxumi domain. When an email concerns an account, set `Reply-To` to that account's contact email. |
| File storage | Cloudflare R2 through the S3 API (AWS SDK v3). Buckets are private, and files are served through short-lived signed URLs. |
| Payments | Stripe Billing: Subscriptions, Subscription Schedules, Checkout, Customer Portal, Coupons/Promotion Codes, Refunds, Customer Balance and webhooks. |
| Sales tax | **Stripe Tax**, with `automatic_tax` enabled on every Checkout and Subscription. Collect billing addresses. Customers can optionally enter a tax ID or exemption. |
| Address | Google Places API (New): Autocomplete with session tokens, ended by a Place Details (Essentials) call. Knoxumi pays this cost. |
| Marketing integration | Mailchimp, connected per account through OAuth. |
| Mobile | React Native with Expo (EAS Build/Update). There are two apps: **Knoxumi Business** and **Knoxumi Kiosk**. |
| PDF | Render HTML templates to PDF with headless Chromium (`@sparticuz/chromium` + `puppeteer-core`) in a Vercel Function. |
| Monorepo | Turborepo with pnpm workspaces. |
| Validation | Zod schemas shared by all apps. Use `libphonenumber-js` for phone numbers. |
| Rich text editor | TipTap (ProseMirror), with custom nodes for fillable fields. |
| Jobs | Vercel Cron plus a Postgres `jobs` table (or Inngest). Every job must be idempotent and retryable. |
| Rate limiting | Upstash Redis. |
| Monitoring | Sentry for the web, admin and mobile apps. |
| Language | English only. All strings go through an i18n helper so other languages can be added later. |

## 3.3 Repository layout

```
knoxumi/
  apps/
    marketing/    # Next.js: knoxumi.com  [DEFERRED]
    app/          # Next.js: app.knoxumi.com — company back office (all products),
                  #   Business-app API, webhooks, cron/jobs
    waiver/       # Next.js: waiver.knoxumi.com — public signing, visitor
                  #   accounts, /verify, kiosk web, visitor/kiosk API
    admin/        # Next.js: admin.knoxumi.com — Knoxumi admin console
    business/     # Expo: Knoxumi Business (company staff) → calls app.knoxumi.com API
    kiosk/        # Expo: Knoxumi Kiosk (signing only) → calls waiver.knoxumi.com API
  packages/
    db/           # Drizzle schema, migrations, seed
    auth/         # Better Auth config for the 3 realms
    platform/     # accounts, users, plans, subscriptions, billing, coupons,
                  #   entitlements, feature flags, announcements, audit
    waiver-core/  # waiver domain rules: versioning, counting, expiry,
                  #   signature status, check-in eligibility
    forms/        # form schema, field registry, validation engine, renderers
    pdf/          # print templates
    emails/       # React Email templates
    api-client/   # typed client for mobile apps
    ui/           # shared design tokens/components
```

Business rules live in `packages/platform` and `packages/waiver-core` and must be unit tested. UIs and apps never re-implement them; they call these packages.

**Code shared between web apps** goes in a package, never copied between apps. For example, the waiver form renderer is used by both `apps/waiver` (visitors filling in a form) and `apps/app` (the builder's preview), so it lives in `packages/forms`.

## 3.4 Brand colors & design tokens

The Knoxumi palette is used across **every Knoxumi surface**: the marketing site, the account web app, visitor pages, the kiosk, the Business app, PDFs and emails. The admin console uses the same palette.

| Token | Hex | Name | Primary uses |
|---|---|---|---|
| `brand-primary` | `#1964d3` | Blue | Primary buttons, links, active navigation, focus rings, charts (first series) |
| `brand-primary-dark` | `#053aa2` | Dark blue | Headers and nav bars, primary button hover/pressed state, headings, footer |
| `brand-accent` | `#fc870e` | Light orange | Call-to-action highlights (e.g. "Start free trial", "Upgrade"), badges, illustrations, chart accents |
| `brand-accent-dark` | `#d35900` | Dark orange | Accent button hover/pressed state, accent icons, large accent headings |

**Contrast rules (WCAG 2.1 AA, which §16.4 requires):**

| Combination | Contrast | Allowed use |
|---|---|---|
| White text on Blue `#1964d3` | 5.5 : 1 | ✔ All text |
| White text on Dark blue `#053aa2` | 9.8 : 1 | ✔ All text |
| Blue `#1964d3` text on white | 5.5 : 1 | ✔ Links and body text |
| Dark text (`#111827`) on Light orange `#fc870e` | about 7 : 1 | ✔ All text. **Orange buttons use dark text, never white.** |
| White text on Light orange `#fc870e` | 2.4 : 1 | ✖ Never |
| Light orange `#fc870e` text on white | 2.4 : 1 | ✖ Never use as text; decoration only |
| White text on Dark orange `#d35900` | 4.0 : 1 | Large or bold text only (18 px bold / 24 px regular and up), e.g. button hover state |
| Dark orange `#d35900` text on white | 4.0 : 1 | Large text and icons only |

**Supporting tokens** (neutral and status colors, chosen so they don't clash with the brand palette):

| Token | Hex | Use |
|---|---|---|
| `text` | `#111827` | Body text |
| `text-muted` | `#4b5563` | Secondary text |
| `border` | `#d1d5db` | Borders, dividers |
| `surface` | `#ffffff` | Cards, page background |
| `surface-alt` | `#f3f6fb` | Alternate sections (a light blue tint) |
| `success` | `#15803d` | ✔ Signed / valid / checked in |
| `warning` | `#a16207` | ⚠ Pending signature, 80% usage. This is a yellow-brown so it stays distinct from the brand orange. |
| `danger` | `#b91c1c` | ✖ Expired, blocked, locked, errors |

* Status must never be shown by color alone. Always pair the color with an icon and a label (✔ / ⚠ / ✖).
* **Dark mode**: define the tokens as CSS variables (and React Native theme values) so dark mode can be added later. Building dark mode is **[DEFERRED]**.
* The tokens are defined once in `packages/ui` and exported as:
  * CSS variables and a Tailwind theme, for the web apps.
  * A theme object, for the Expo apps.
  * Constants, for the PDF and email templates.
* No component may hard-code a hex value.
* **White-label pages** (§7.9) keep the Knoxumi palette for UI controls. Only the logo and header branding change. Per-company colors are **[DEFERRED]**.

## 3.5 Environments

| Environment | Git branch | Domains | Services |
|---|---|---|---|
| Production | `main` | `knoxumi.com`, `app.knoxumi.com`, `waiver.knoxumi.com`, `admin.knoxumi.com` | Neon main branch, Stripe **live**, Resend production domain |
| Staging | `staging` | `staging.knoxumi.com`, `app.staging.knoxumi.com`, `waiver.staging.knoxumi.com`, `admin.staging.knoxumi.com` | Neon `staging` branch, Stripe **test**, Resend with a restricted test audience |
| Preview | any other branch / PR | Vercel-generated `*.vercel.app` per project | Neon preview branch per PR, Stripe test |

* Staging domains are assigned to the `staging` Git branch in each Vercel project.
* Staging is protected with Vercel Deployment Protection and sends `noindex` headers.
* Every hostname, auth base URL, trusted origin and webhook URL comes from environment variables, which are set separately per environment.
* `.env*` files are never committed.

## 3.6 Adding a new product (pattern)

Use this checklist for every future product. "Scheduling" is the example.

1. Add `apps/scheduling` for the product's **public** site, and create a new Vercel project for it with the domain `scheduling.knoxumi.com` (and `scheduling.staging.knoxumi.com`).
2. Add the product's company back-office screens to **`apps/app`** under `/scheduling/...`. There is no new back-office site.
3. Put the product's domain rules in `packages/scheduling-core`.
4. Add a `products` row, its plans and Stripe Product/Prices (through Admin → Plans), and its permissions to the checklist.
5. Add the product's native screens to the **Business app**. There is no separate company app per product.
6. Add `scheduling` to the reserved slug list.
7. Add a marketing page at `knoxumi.com/scheduling`.

Nothing else changes: accounts, users, billing, coupons, admin, feature flags and announcements are all product-aware already.

# 4. Platform: accounts & products

## 4.1 Accounts

* An account has: a name, a **slug** (unique and platform-wide, used by every product's public URLs), a timezone, a logo, contact details, an address, one Stripe customer, a `max_users_override` and an admin lock flag.
* Slugs:
  * Lowercase `a-z0-9-`, 3 to 40 characters.
  * A **reserved list** is enforced: `app`, `admin`, `api`, `kiosk`, `login`, `signup`, `account`, `verify`, `help`, `pricing`, `legal`, `terms`, `privacy`, `www`, `mail`, `support`, `billing`, `knoxumi`, `static`, `_next`, plus every product code.
  * When a slug changes, the old slug redirects for 90 days.
* Accounts are created in one of two ways:
  * **Self-serve**, from the marketing site or `app.knoxumi.com/signup`.
  * **By an admin** (§14.4), for example for enterprise customers.

## 4.2 Product subscriptions

* An account can have **one subscription per product**. Each product subscription has its own plan, Stripe subscription, trial, billing anniversary, usage periods and status.
* A product's status never affects another product. For example, if Waiver is locked, a future product keeps working.
* Adding a product starts **that product's free trial** (trials are per product).
* Entitlements are resolved by `getEntitlements(accountId, product)` in `packages/platform`. It returns the status, limits, usage, feature flags and capabilities. Every server action and API route calls it, and the UI only displays the result.

## 4.3 Account users

* Users are **shared across all of an account's products**. Permissions are granted per product (§9.8), along with account-level permissions (Manage users, Manage billing, Manage account settings).
* **The user cap is per account.** The effective cap is `account.max_users_override` if set; otherwise the highest `max_users` among the plans of the account's active product subscriptions; otherwise 3.
* The invite UI and API block invites beyond the cap.
* One user is the **Owner**. The Owner holds all permissions, cannot be removed, and can transfer ownership.

## 4.4 Bundle discounts **[DEFERRED]**

The data model must support future multi-product discounts, for example a `bundles` table linking products to a Stripe coupon. Nothing is built for this now.

# 5. Multi-tenancy

* Every tenant-scoped table has an `account_id` column. All data access goes through repositories that require `account_id`. Use Postgres Row Level Security as defence in depth.
* Automated tests must try cross-tenant reads and writes, and every one must fail.
* Admin access (§14) uses a separate, explicitly audited repository path. It never reuses tenant sessions, except through impersonation (§14.6).

# 6. Identity & authentication

There are three **separate realms**, each with its own tables, sessions, cookies and host. The same email address can exist independently in every realm.

## 6.1 Visitor realm (`waiver.knoxumi.com`, kiosk)

* **Global account.** When a visitor opens `/{company}/{waiver}`, they see only their data for that company. Data from other companies is never displayed and never used for prefill.
* The identifier is a verified **email**. Phone is profile data only.
* Login methods: email + password, **magic link**, or **6-digit email code** (OTP). Links and codes expire after 15 minutes, can be used once, and are rate-limited.
* Passwords must be at least 10 characters and are checked against a breached-password list.
* Profile fields: name, email, phone, date of birth and address. They prefill the signer's fields.
* An "All my waivers" page lists every submission grouped by company, with PDF downloads for every revision.

## 6.2 Guest signing **[COMPANY SETTING: default is "require account"]**

* When guest signing is allowed, the visitor gives a name and email and must **verify the email by OTP** before submitting.
* The submission is linked to a shadow visitor record. If that email later creates an account, all of its guest submissions are claimed automatically.

## 6.3 Account-user realm (`app.knoxumi.com`, Business app)

* Users are invited by email.
* Login methods: email + password or magic link, with optional TOTP 2FA.
* The mobile app authenticates with bearer tokens through the Better Auth Expo plugin.

## 6.4 Admin realm (`admin.knoxumi.com`)

* There is **one admin user** in v1. Make the model multi-admin capable (an `admins` table and a role field), but build no role UI.
* The admin is created by a CLI seed command. There is no public signup.
* **Mandatory 2FA**: a **passkey** (WebAuthn) is the primary factor, with **TOTP** as backup. Generate one-time recovery codes.
* Sessions last up to 8 hours, with a 30-minute idle timeout. Logging in again requires 2FA.
* **IP allowlist (built in, off by default)**:
  * Admin → Settings → Security has a list of allowed IPs/CIDRs and an **Enforce allowlist** toggle.
  * When the toggle is on, middleware (and a Vercel Firewall rule, where possible) rejects all requests to `admin.knoxumi.com` from addresses not on the list.
  * Before the toggle can be turned on, the UI must show the admin's current IP and require that IP to be on the list.
  * **Break glass**: if the environment variable `ADMIN_IP_ALLOWLIST_DISABLED=true` is set and the app is redeployed, enforcement is bypassed. This lets the admin recover access.
* Failed admin logins are rate-limited and emailed to the admin.

# 7. Knoxumi Waiver: visitor front end

## 7.1 Entry flow

1. The visitor opens `waiver.knoxumi.com/{companySlug}/{waiverSlug}`. The `/{companySlug}` page lists the account's active waivers.
2. The system checks signing eligibility (§13.8). If the account is not eligible, show this message and stop: *"This business is not accepting new waivers online right now. Please see a staff member."* Visitors never see upgrade or pricing language.
3. Show branding (§7.9), then login, account creation or guest signing.
4. If the visitor already has a submission for this waiver template, show their **waiver dashboard** (§7.5). Otherwise, show the form.

## 7.2 Filling the waiver

* The form renders from the template's **current published version**. The signer's fields are prefilled from their profile.
* **Repeating participant groups** (for example "Children" or "Additional adults") have the min/max counts and fields the company configured.
* Each participant is classified as an adult or a minor from their date of birth on the signing date.
* Fields are validated inline (§9.4), and the server re-validates everything.
* Drafts autosave on the server and expire after 7 days.
* Before signing, a **review screen** shows the full waiver exactly as the PDF will show it.

## 7.3 Signing

* Signature types:
  * Drawn (canvas, stored as SVG paths and a PNG) and/or typed (a script font plus the raw text). **[COMPANY SETTING: default is both]**
  * **Initials** fields follow the same setting.
* Before signing, the visitor must check an ESIGN/UETA electronic-signature consent box. Its text is provided by Knoxumi, is versioned, and cannot be edited by the company.
* The visitor must also attest that they are 18 or over and the legal guardian of any minors listed.
* **One adult's signature covers all minors.**
* **Every adult participant must personally sign before they can be checked in.**

## 7.4 After submission

* A confirmation screen shows the participants and each adult's signature status.
* An **"Email me a copy"** option (checked by default) sends the PDF through Resend.
* Marketing opt-ins are part of the form (§9.13).

## 7.5 Waiver dashboard (returning visitor)

* Shows the status: valid until a date, expired, needs re-sign, or pending co-signers.
* Shows the participants and each adult's signature status.
* Actions: add or edit participants, renew or re-sign, download a PDF (any revision), and resend a co-signer invite.

## 7.6 Additional adults & co-signing

* Each additional adult needs an email address. **[COMPANY SETTING: required, on by default]** If the company makes the email optional, that adult must sign in person at the kiosk.
* The adult receives a co-sign link that **expires after 15 days**. Opening it requires logging in, signing up or verifying by OTP with that email. The adult can also sign at the kiosk or from their own account.
* The submitter or staff can resend an expired invite.
* Pending adults show ⚠ everywhere, and **cannot be checked in** until they sign the current revision.

## 7.7 Editing a submission

* Any change creates a **new revision**. Earlier revisions and their PDFs are never altered.
* The **submitter must re-sign**. Every other adult resets to *Pending* and receives a new co-sign link.
* Edits **do not count** toward the plan limit (§13.4).
* Edits are blocked whenever the account is not eligible (§13.8).

## 7.8 Version changes, expiry & turning 18

* **On publishing a new version**, the company chooses one of two options:
  * **Require re-sign**: existing submissions show *Needs re-sign*, and their participants are blocked at check-in until they re-sign.
  * **New signers only**: existing submissions stay valid on their original version.
* **Expiry** **[COMPANY SETTING: default is 1 year]**:
  * Options: 1 day, 2 weeks, 1 month, 3 months, 6 months, 1 year, 2 years, 3 years, or never.
  * The expiry is counted from the last full signing (the first submission or a renewal), not from edits.
* **Renewal** opens the current version pre-filled with the last revision's data. A renewal **counts** toward the plan limit.
* An expiry reminder email goes to the visitor 14 days before expiry. **[COMPANY SETTING: on by default]**
* **Turning 18**: a minor who has turned 18 is flagged *Needs own signature* and blocked at check-in until they sign. The submitter is emailed so they can provide that person's email for a co-sign link.

## 7.9 Branding

* By default, visitor pages carry Knoxumi branding, with the company's logo and name in the waiver body.
* **White-label** replaces the Knoxumi header with the company's logo and keeps a small "Powered by Knoxumi" footer. It is available only when the admin enables `white_label_allowed`, which can be set per account or per plan **[ADMIN]**. The company then turns it on in its settings.

# 8. Legal record & evidence (critical)

## 8.1 Immutability

* A published waiver version is immutable.
* A submission revision becomes immutable once any signature is applied to it.
* Evidence tables are append-only. This is enforced with database grants and triggers, and only the retention purge (§12) may delete from them.
* **Impersonation can never create a signature.** An admin impersonating a visitor can view data and change profile or settings, but every signing action is disabled during impersonation and blocked server-side.

## 8.2 Stored per revision

* The `waiver_version_id`, plus a **frozen copy of the version's schema and rendered text**.
* All field values, participants and opt-ins (including the consent text and timestamp).
* For each signature event:
  * The signature and initials data (image or typed text).
  * The signer's visitor id, name and email.
  * The auth method used: password, magic link, OTP, guest OTP or kiosk OTP.
  * The UTC server timestamp and the company's local time.
  * The IP address and user agent, plus parsed device, OS and browser.
  * The screen size, browser timezone and locale.
  * The channel (web, kiosk web or kiosk app), the kiosk device id, and the account user who launched the kiosk.
  * Optional geolocation, captured only if the visitor grants permission.
  * The versions of the consent and attestation text shown.
* A **PDF**, regenerated after each signature event and stored in R2. Stored PDFs are never overwritten.
* **SHA-256 hashes** of the canonical data plus evidence, and of the PDF. Each revision's hash is chained to the previous revision's hash.

## 8.3 PDF

* The body contains:
  * The company logo, the waiver title and the version date.
  * The waiver text with the filled values inline.
  * The participants.
  * The signatures and initials.
  * The opt-ins.
* The **final page is an audit trail**, showing:
  * The document id, the revision number, and the version id and date.
  * Each signer's name, email, timestamp, IP, device and method.
  * The hashes.
  * The verification URL `waiver.knoxumi.com/verify/{docId}`.
* PDFs are stored at `{accountId}/{submissionId}/rev-{n}-{hash8}.pdf` and served through signed URLs that expire after 5 minutes.

## 8.4 Legal disclaimer

The following text appears in the account terms (accepted at signup) and as a persistent note in the form builder:

*Knoxumi provides software only and does not provide legal advice. Each company is solely responsible for the content, enforceability and legal compliance of its waivers, and should have them reviewed by a qualified attorney.*

# 9. Knoxumi Waiver: company back end (web)

These are the waiver screens at `app.knoxumi.com/waiver`. The Business app exposes all of them (§11).

## 9.1 Signup

* **Self-serve signup** collects:
  * The company name and slug (with a live availability check against the reserved list).
  * The owner's name, email and password.
  * The timezone, contact details and address.
  * Acceptance of the terms and the disclaimer.
* Signup creates the **account**, the **owner** and a **Waiver product subscription in trial**: 14 days or 20 signed waivers, whichever comes first, with no card required.

## 9.2 Dashboard

* Shows:
  * Signed waivers today and check-ins today.
  * A **usage meter** (`used / limit`, plus days left in the period).
  * Recent submissions and pending co-signers.
  * Platform announcements (§14.12).
* Shows the **80% banner** and the **limit/inactive banner** (§13.7).

## 9.3 Form builder (WYSIWYG)

* A TipTap document editor that supports:
  * A logo and images, headings, rich text, lists, links and dividers.
  * Page breaks and sections.
  * **Fillable field nodes**, inserted from a field palette or with slash commands.
* **Participant groups**: a label, min/max counts, a restriction (adult only, minor only or any), and the fields inside the group.
* **Conditional logic**: show or hide a field, section or group based on another field. Supported conditions: equals, not equals, contains, checked, greater than, less than, and participant age. Hidden fields are not required and their values are not stored.
* Live preview at desktop and mobile widths, plus a **Preview as PDF** button.
* Per-template settings:
  * Name, slug and description.
  * An expiry override, the default re-sign policy, and the allowed signature types.
  * Which opt-ins are shown.
* Autosave, undo and redo.

## 9.4 Field types & validation

Every field has these properties: label, key, help text, required, placeholder, default value, width, and a **rule set**. The rule set has sensible defaults that can be overridden or extended.

| Field type | Default validation | Configurable overrides (examples) |
|---|---|---|
| Short text | Max 200 characters | Min/max length, regex, custom error message |
| Long text / notes | Max 5,000 characters | Min/max length |
| First / last / full name | Letters, spaces, `-` and `'`; 1–100 characters | — |
| Email | Valid email format | Must match the signer's email |
| Phone | Valid number via libphonenumber (US region by default) | Allowed countries, mobile only |
| Date | Valid date | Min/max date, past only, future only |
| Date of birth | Valid past date; **the signer must be 18 or over** | Participant min/max age (e.g. children must be 16 or over), age measured on the signing date |
| Address | Google Places autocomplete; must resolve to a street number, city, state and ZIP | Allow manual entry, restrict country |
| Number | Numeric | Min/max, integers only |
| Dropdown / radio / checkbox group | The value must be one of the options | Options, "Other" option, min/max selected |
| Checkbox | — | Must be checked |
| Yes / No | — | Must equal yes or no |
| Initials | Must be completed | **Must match the signer's initials** |
| Signature | Must be completed | Allowed types |
| Emergency contact | Name, valid phone and relationship | Phone must differ from the signer's |
| Medical / allergy notes | Long text | — |
| File upload | Max 10 MB; jpg, png or pdf | Allowed types, max size |
| Static text, heading, image | Display only | — |
| Marketing opt-in (email / SMS) | Unchecked by default (this cannot be changed) | Label text |
| Hidden / computed | — | Values such as today's date or the version date |

Cross-field rules:

* Field A equals field B.
* Initials match the signer.
* A group has at least N participants.
* A participant's age is between N and M.

Rules are stored as data and run by the shared engine in `packages/forms`, on both the client and the server. **The server's result is authoritative.**

## 9.5 Waiver lifecycle

* A template moves from **Draft** to **Published** to **Archived**. Several templates can be active at the same time.
* Publishing creates an immutable version with `published_at` and `published_by`.
* Version history shows each version, a text and field diff between versions, and the number of signatures per version.
* Archiving a template hides it from visitors. Existing submissions are unaffected.

## 9.6 Publishing

At publish time, the company chooses **Require existing signers to re-sign** or **New signers only**. The template setting supplies the default. The choice is stored on the version.

## 9.7 Signed waivers

* **Today**: newest first, in the company's timezone.
* **All**: ordered by date entered, newest first. Filters: template, date range, and status (valid, expired, needs re-sign, pending co-signers).
* **Search** covers every participant's name, plus email, phone, date of birth and submission id.
* **Detail view**:
  * The current revision's participants, each with a badge: ✔ signed, ⚠ pending, or ⚠ needs own signature.
  * Tabs: Data, PDFs (all revisions), Evidence, Check-ins, Activity.
* Company users **cannot edit** a visitor's data.

## 9.8 Users & permissions

Each user has a custom permission checklist.

* Account-level permissions:
  * Manage users
  * Manage billing
  * Manage account settings
* Waiver permissions:
  * View signed waivers
  * Download / export
  * Check in / check out
  * Launch kiosk
  * Create / edit waiver drafts
  * Publish / archive
  * View reports
  * Manage waiver settings
  * Manage integrations

The Owner has every permission. Every permission is enforced server-side.

## 9.9 Waiver settings

| Setting | Default |
|---|---|
| Require visitors to create an account (otherwise guest signing is allowed) | On |
| Allowed signature types | Drawn and typed |
| Default waiver expiry | 1 year |
| Record retention | 3 years (options: 1, 2, 3, 5, 7 or 10 years) |
| Allow check-ins of signed waivers | Off |
| Allow check-outs (requires check-ins) | Off |
| Co-signer email required | On |
| Expiry reminder emails to visitors | On |
| Email marketing opt-in / SMS marketing opt-in | Off / Off |
| White-label (only if allowed by an admin) | Off |
| Notifications (daily summary, or one per new waiver) | Daily summary |

Timezone, logo, contact details and slug are **account** settings, shared across products.

## 9.10 Check-ins **[COMPANY SETTING: off by default]**

* The check-in screen has a search box and lists today's recent submissions.
* Selecting a submission lists **every participant on the current revision**, each with a checkbox and a status:
  * ✔ Valid
  * ⚠ Pending signature (blocked)
  * ⚠ Needs own signature (blocked)
  * ✖ Expired or needs re-sign (blocked; a "Send renewal link" action is offered)
* A check-in record is created per participant, storing the participant, revision, user, device and time.
* If the same participant is checked in twice within 30 minutes, show a warning. The user can override it.
* **Check-out** **[COMPANY SETTING: off by default]** shows a "Currently checked in" list. Users can check out one participant or everyone on a submission, and the visit duration is recorded.
* Check-ins are blocked when the product is in the `trial_ended`, `locked`, `hold` or `canceled` state (§13.8).

## 9.11 Reports

* Signed waivers by day, week and month, split into new, renewals and edits.
* Check-ins by day and by hour (a heatmap). Check-outs and average visit duration, if enabled.
* Participants by age bracket.
* Marketing opt-in lists.
* Usage against the limit, for the current and past periods.
* Every report can be filtered and exported to CSV.

## 9.12 Data export

* Exports a CSV of all data plus a ZIP of all PDFs. The export runs in the background and emails a link that expires after 7 days.
* **Export is available in every state, including after cancellation**, until the data is purged.

## 9.13 Mailchimp (per account)

* The company connects Mailchimp through OAuth, then chooses an audience and tags.
* Email opt-ins are upserted to the audience with the tags `knoxumi` and the waiver name.
* SMS opt-ins are synced through Mailchimp SMS if the company's account supports it. Otherwise they are stored in Knoxumi and included in exports.
* Settings show the sync status, the last sync time and any errors.
* Mailchimp sits behind a `MarketingProvider` interface so other providers can be added.

## 9.14 Company notification emails

* The daily summary.
* Optionally, one email per new waiver.
* Usage at 80% and at 100%.
* Trial ending (3 days and 1 day before) and trial ended.
* Payment failed (one per retry), account locked, plan changed and plan price change notices.

# 10. Knoxumi Kiosk (signing only)

## 10.1 Apps

* The **Knoxumi Kiosk** Expo app for iOS and Android.
* The **kiosk web app** at `waiver.knoxumi.com/kiosk`, installable as a full-screen PWA.

The kiosk is **only for visitors to create, edit, renew and co-sign waivers**. It never shows lists of signed waivers or any company function.

## 10.2 Behavior

* An account user with the *Launch kiosk* permission logs in, chooses which active waivers the kiosk offers, and sets a **4 to 6 digit exit PIN**.
* The PIN is required to exit or to change the waiver selection.
* Kiosk devices are listed under the account's settings and can be revoked there.
* Visitor flow:
  1. The visitor enters an email.
  2. They receive a **6-digit code** and enter it.
  3. They continue through the normal web flow.
* Guest mode, when allowed, still verifies the email by code.
* **There is no inactivity timeout** while a visitor is filling the form.
* After submission, the confirmation screen stays for 10 seconds (or until the visitor taps Done). The kiosk then **auto-resets** and clears the visitor session.
* A "Start over" button is always visible.
* The evidence records the channel as kiosk, plus the device id.
* The setup guide recommends iOS Guided Access or Android screen pinning.

# 11. Knoxumi Business app (company staff)

* An Expo app for iOS and Android, logged in as an **account user**. It gives access to **every company function** the user has permission for.
* **Hybrid build** (the "web app with an app face"):
  * **Native screens** for the daily operations staff use on the floor, which need to be fast and touch-friendly:
    * Today's signed waivers
    * All signed waivers (by date entered, newest first)
    * Search
    * Waiver detail with participant signature badges
    * Check-in and check-out
    * The usage banner and announcements
  * **Everything else** opens the responsive web app inside an authenticated in-app WebView, using the same session. This covers the form builder, settings, users, reports, integrations and exports.
  * On iOS, **billing changes open in the system browser** rather than in the app, to comply with App Store rules on purchases.
* Native screens call `app.knoxumi.com/api/v1` through `packages/api-client`. The WebView loads `app.knoxumi.com`.
* Push notifications **[DEFERRED]**. Offline mode **[DEFERRED]**. When there is no connection, show a clear offline message.

# 12. Retention & privacy

## 12.1 Retention

* Retention is a **[COMPANY SETTING]** with a default of **3 years**.
* A submission becomes purgeable when *max(expiry date, last signature date) + retention period* has passed and it has no check-ins within that window.
* A daily purge job deletes purgeable data from both the database and R2, and writes a purge log entry containing ids only.
* A company can place a **legal hold** on a submission, which prevents it from being purged.
* **Retention is always honored.** No path, including admin deletion of an account, purges a signed waiver before its retention ends (§14.4).

## 12.2 Visitor "delete my data"

Knoxumi follows the controller/processor model: the company is the data controller and Knoxumi is the processor.

* A visitor can delete their account at any time. Deletion **immediately** removes:
  * Their login credentials, profile and drafts.
  * Their marketing opt-ins (and unsubscribes them in Mailchimp).
* **Signed waivers are kept** until each company's retention period ends. These are records needed for legal claims, which privacy law exempts from deletion (GDPR Art. 17(3)(e); CCPA/CPRA). The visitor is shown this before confirming.
* The request is logged, and every company the visitor signed with is notified.

# 13. Billing (platform)

## 13.1 Model

* There is **one Stripe Customer per account**, and **one Stripe Subscription per product subscription**. Trials, holds, locks and anniversaries are therefore independent per product.
* **Stripe Tax** calculates and collects sales tax on every invoice. The customer's billing address is required at checkout.
* Plans live in the `plans` table, linked to a product, with these fields: `monthly_limit`, `max_users`, the monthly and annual prices, `white_label_allowed`, a feature set, and the Stripe Price IDs. **Prices are never hard-coded.**
* Stripe Prices are immutable, so every price change creates a new Stripe Price (§14.8).

## 13.2 Knoxumi Waiver plans (initial seed)

| Plan | Signed waivers per period | Monthly | Annual (15% off) | Max users |
|---|---|---|---|---|
| Free trial | 20 total, over 14 days | $0 | — | 3 |
| Starter | 50 | $10 | $102 | 3 |
| Basic | 100 | $20 | $204 | 3 |
| Plus | 300 | $40 | $408 | 3 |
| Pro | 600 | $65 | $663 | 3 |
| Business | 1,000 | $100 | $1,020 | 3 |
| Enterprise | Custom (set by admin) | Custom | Custom | Custom |
| Hold | 0 (no new waivers) | $5 | $51 | 3 |

* The plan names are placeholders.
* For more than 1,000 waivers a month, the pricing page shows "Contact us", which creates an **enterprise lead** (§14.10).
* Enterprise is paid by card through Stripe. No invoicing terms are needed.

## 13.3 Trial

* The trial is **per product** and requires no card. It lasts 14 days or 20 signed waivers, whichever comes first.
* When the trial ends, the product moves to `trial_ended`:
  * Company users can log in, view and export.
  * No new waivers, edits or check-ins are allowed.
  * Visitors can still log in and download their waivers.

## 13.4 Counting

* These **count** toward the limit: a new submission and a **renewal** after expiry. A submission counts once, however many participants it has.
* These **do not count**: edits and additions (new revisions), co-signatures, and a re-sign required by a new version before the waiver has expired.
* Each revision stores `billing_counted` and `count_reason`, so the rules can change later.
* Counting happens atomically in a transaction with a row lock on the current usage period, so concurrent signings can never push usage over the limit.

## 13.5 Periods, upgrades, downgrades, cancellation

* Billing periods are anchored on the product subscription's anniversary. Usage resets each period. Webhooks drive the reset, and a cron job acts as a safety net.
* **Upgrades take effect immediately** and are **prorated**. The new limit applies at once.
* **Downgrades** are scheduled for the **next period** through a Stripe Subscription Schedule. The UI shows "Changes to X on {date}".
* **Cancellation** takes effect at **period end**, with **no refund** (`cancel_at_period_end`). The account keeps full use until that date. After cancellation, the product moves to `canceled` and remains read-only with export until the data is purged.
* **Hold**:
  * Moving to Hold takes effect at period end by default, or immediately if the customer asks.
  * Leaving Hold works like an upgrade and takes effect immediately.
* Customers can switch between monthly and annual billing.
* Invoices, payment methods and tax IDs are managed in the Stripe Customer Portal.

## 13.6 Coupons

* **Types**:
  * Percent off.
  * Fixed amount off.
  * Free months (100% off for N months).
  * **Bonus waivers per period**: adds N to the period limit. Knoxumi tracks this itself; it is not a Stripe discount.
* **Duration**:
  * Once, N months, or forever.
  * An optional **expiration date** (the last day it can be redeemed).
  * Optional **max total redemptions**.
* **Restrictions**:
  * **Once per customer**.
  * **Once in total**.
  * **New subscribers only**.
  * Scoped to a **product** and to one or more **plans**, and optionally to an interval (monthly or annual).
* **One coupon per subscription**. Coupons never stack.
* **How coupons are applied**:
  * A customer enters a **promo code at checkout** or in Billing.
  * An **admin applies a coupon** to a product subscription (§14.9).
* Monetary coupons map to Stripe Coupons and Promotion Codes. Knoxumi enforces the restrictions Stripe cannot express, such as once per customer across products or bonus waivers.

## 13.7 Usage warnings

* **At 80% or more**, every company screen (on the web and in the Business app) shows: *"You've used {used} of {limit} signed waivers. {remaining} left with {days} days remaining in this billing period. Upgrade to avoid interruption."* Users with *Manage billing* see an Upgrade button; other users see "Ask your account owner to upgrade". One email is sent per period.
* **At 100%**, the banner reads: *"You've reached your plan limit of {limit}. New waivers can't be signed until you upgrade or your next period starts on {date}."* One email is sent.
* Visitors only ever see the neutral message from §7.1.

## 13.8 Product subscription states

| State | Cause | New waivers | Edits / co-sign | Renewals | Check-ins | Company view / export | Visitor login / download |
|---|---|---|---|---|---|---|---|
| `trialing` | Trial is active | ✔ (up to 20) | ✔ | ✔ | ✔ | ✔ | ✔ |
| `trial_ended` | 14 days or 20 waivers reached | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ |
| `active` | Paid and under the limit | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `limit_reached` | Usage equals the limit | ✖ | ✔ | ✖ | ✔ | ✔ | ✔ |
| `past_due` | Payment failed; within the retry window | ✔ | ✔ | ✔ | ✔ | ✔ (with a banner) | ✔ |
| `locked` | 3 retries failed, or locked by an admin | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ |
| `hold` | On the Hold plan | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ |
| `canceled` | Cancelled at period end | ✖ | ✖ | ✖ | ✖ | ✔ (until purge) | ✔ (until purge) |

## 13.9 Failed payments

* Stripe is configured for **3 retries, one per day**, with Smart Retries turned off.
* During the retries the product is `past_due`: a banner is shown and an email goes out on each attempt.
* After the third failure, the product moves to `locked`. Paying the invoice restores `active` immediately through a webhook.
* Every Stripe event is stored in `stripe_events` and processed idempotently.

# 14. Knoxumi Admin (`admin.knoxumi.com`)

The admin console is a single console for all products. A **product switcher** filters every screen (All, Waiver, and future products). The admin can **view everything**, including signed waivers, PDFs and evidence. **Every admin action is written to the admin audit log** (§14.15).

## 14.1 Navigation

* Dashboard
* Accounts
* Visitors
* Subscriptions & Billing
* Plans
* Coupons
* Enterprise Leads
* Announcements
* Feature Flags
* System Health
* Reports
* Audit Log
* Settings

## 14.2 Dashboard

The dashboard can be filtered by product and date range. It shows:

* **MRR and ARR** (net of discounts, excluding tax), with a trend.
* New signups, trials started, active trials, **trial conversion rate**, and expired trials.
* **Churn**: logo churn and revenue churn, plus downgrades and holds.
* Plan distribution: the number of subscriptions and the MRR per plan.
* Signed waivers across the platform, by period, and **the top accounts by volume**.
* Accounts **at 80% or more** of their limit, and accounts **at their limit** (upgrade candidates).
* Accounts that are **past due**, **locked**, or have failed payments in the last 30 days.
* Total visitors and new visitors.
* Enterprise leads that are open.
* System health at a glance: failed jobs, webhook errors and email bounces.

## 14.3 Accounts

**The list** can be searched by name, slug, owner email or Stripe id. Filters: product, plan, status, trial, and date ranges. Columns: name, products and statuses, plan, usage this period, MRR, signup date and last activity.

**The detail page** has these tabs:

* **Overview**: profile, slug, timezone, owner, effective user cap, and flags such as white-label.
* **Products**: each product subscription with its plan, status, period dates, usage and limit, any bonus waivers, the coupon applied, and any scheduled change.
* **Users**: the account users and their permissions.
* **Waivers**: templates, versions and submissions. The admin can open any PDF or evidence record.
* **Billing**: invoices, payments, refunds, credits and tax. Links go to the matching Stripe objects.
* **Notes**: the internal notes log (§14.5).
* **Activity / Audit**: account events plus admin actions on this account.
* **Feature flags**: per-account overrides.

## 14.4 Account actions

* **Create an account manually**, for example for an enterprise customer:
  * Enter the company details and slug, and the owner's email (an invite is sent).
  * Choose the product(s) and plan, including a custom Enterprise plan.
  * Optionally apply a coupon or set a user cap override.
  * Send the owner a Stripe Checkout link to add a card, or start the subscription in trial.
* **Edit** the account's details, and **change the slug** (the old slug redirects).
* **Change the plan**: immediately (prorated) or at the next period.
* **Extend a trial**: add days and/or waivers.
* **Add bonus waivers** to the current period, with a reason.
* **Lock or unlock** a product subscription, with a reason. Admin locks are separate from payment locks.
* **Cancel**: at period end (the default) or immediately. Either way there is no automatic refund.
* **Delete an account**:
  * Requires typing the account slug to confirm.
  * Cancels all subscriptions, disables every user login and closes the account.
  * **Retention is always honored.** Signed waivers stay until their retention period ends and are then removed by the normal purge, after which the remaining account record is purged.
  * The admin can still export the data during this time.
* **Set a user cap override**.
* **White-label allowed**: on or off.
* **Refund** a payment (full or partial, any amount), with a reason, issued through the Stripe Refunds API. **A refund never changes the plan or the status automatically.**
* **Credit**: add a Stripe customer balance credit, applied to the next invoice.
* **Apply or remove a coupon** (§14.9).
* **Impersonate** an account user (§14.6).

## 14.5 Notes

* Internal notes are kept per account (and optionally per visitor), each timestamped with its author.
* Notes can be pinned and edited. Edits are versioned.
* Accounts never see notes.

## 14.6 Impersonation

* The admin can impersonate **any account user** or **any visitor**.
* Impersonation gives full access as that user, with **one exception: no signing** (§8.1).
* **The company and the visitor are not notified.**
* The session expires after 60 minutes, and the admin can end it at any time.
* A persistent bar, visible **only in the admin's session**, shows "Impersonating {name} — End".
* Every request made during impersonation is stamped with `impersonator_admin_id`. Every write is recorded in both the admin audit log and the account's audit log, with a flag marking it as an impersonated action.
* Implementation: the admin console creates a single-use impersonation token, which opens a session on `app.` or `waiver.` that is marked as impersonated. Impersonated sessions can never reach the admin console.

## 14.7 Visitors

* Search visitors by name, email or phone.
* The detail page shows the profile, auth methods, and submissions across all companies (with PDFs and evidence), plus data requests and opt-ins.
* Actions: impersonate, resend verification, and delete the visitor's account. Deletion follows the §12.2 rules, so waivers are retained.

## 14.8 Plans & pricing

* Plans are managed per product. The admin can create plans (including custom Enterprise plans attached to a single account), edit them, and archive them.
* Editable fields: name, monthly limit, max users, monthly and annual prices, white-label allowed, feature set, and whether the plan is public on the pricing page.
* **When the price or limit of a plan with existing subscribers changes**, the admin must choose when it applies to those subscribers:
  1. **Immediately**: limits apply now. The price moves to a new Stripe Price; by default it starts on the next invoice with no proration.
  2. **On a specific date**: a scheduled job applies the change on that date.
  3. **On each subscriber's next anniversary**: a Stripe Subscription Schedule phase is added per subscription.
* The admin can optionally send affected accounts a notice email that shows the old and new values and the effective date.
* New subscribers always get the new values immediately.
* Every plan change is versioned (`plan_versions`), so reports and invoices can show what applied at any given time.

## 14.9 Coupons

* Coupons can be created, edited (only fields that are safe to change), disabled, and viewed with their redemption history.
* Each coupon has: a code (or no code, for admin-only use), a type and value, a duration, an expiration date, max redemptions, a once-per-customer flag, a new-subscribers-only flag, and a scope (product, plans and interval). See §13.6.
* The admin can apply a coupon directly to a product subscription. The usual restrictions are enforced, with an override checkbox that requires a reason.
* The coupon screen shows redemption counts and the MRR impact.

## 14.10 Enterprise leads

* Leads come from the marketing site's contact form (§17) and from in-app "Contact us" requests.
* Each lead has a company, contact, email, phone, expected volume, message and source.
* Status pipeline: New → Contacted → Proposal → Won or Lost. Leads can have notes.
* The admin can **convert a lead to an account**, which opens §14.4 *Create account*.

## 14.11 Billing operations

* Failed payments, `past_due` and `locked` lists, with retry counts and the next retry date.
* An option to **retry a charge now**, and a button to **send the Customer Portal link** to the owner.
* Refund and credit history.
* Tax summary by state and period, taken from Stripe Tax data, with a link to the Stripe Tax reports.

## 14.12 Announcements

* Announcements show a banner on company screens (on the web and in the Business app).
* Each announcement has a title, a message, an optional link, and a severity: info, warning or critical. Critical is used for "system down" messages.
* **Targeting**: everyone, specific products, or specific plans.
* Each announcement has a **start and end date and time**, and can optionally be dismissed by each user.
* Optional visitor-facing announcements on waiver pages, for example "Signing is temporarily unavailable". These are only shown at the critical severity.

## 14.13 Feature flags

* Each flag has a key, a description and a product.
* Settings:
  * A **global on/off** switch.
  * A **percentage rollout**, using a stable hash of the account id.
  * Optional plan targeting.
  * **Per-account overrides** that force a flag on or off.
* `isEnabled(flag, accountId)` lives in `packages/platform`. Results are cached for a short time and cleared whenever a flag changes.
* White-label is a plan/account entitlement, not a feature flag.

## 14.14 System health

* **Jobs**: queued, failed and dead jobs, filtered by type (PDF generation, Mailchimp sync, email, export, purge, usage reset). Each shows its error and attempt count. Actions: **Retry** and **Discard**.
* **Stripe webhooks**: stored events with their processing status and errors. Action: **Replay**.
* **Email**: bounces and complaints from Resend webhooks, and failed sends. Action: resend.
* **Integrations**: Mailchimp connections that have errors.
* **Cron**: the last run, duration and result for each scheduled job, with an alert if a job is overdue.
* Links to Sentry and the Vercel logs.

## 14.15 Admin audit log

* Records **every** admin action: logins, failed logins, impersonation start and end, every write, refunds, credits, plan and price changes, coupon changes, flag changes, announcements, deletions, exports, and changes to settings or the IP allowlist.
* Each entry stores who, what, the target, before and after values, the IP, the user agent and the timestamp.
* **It is kept permanently, is append-only, and can never be purged.**
* It can be searched and exported to CSV.

## 14.16 Reports

All of the following can be filtered by product, plan and date range and **exported to CSV**:

* MRR/ARR history
* Signups and conversions
* Churn
* Plan mix
* Waiver volume by account
* Accounts at or near their limit
* Failed payments
* Refunds and credits
* Coupon redemptions
* Visitors

## 14.17 Daily digest & alerts

* A **daily digest email** goes to the admin's email address, which starts as shawn.dorman@outlook.com and can be changed in Settings.
* The **send time and timezone are set by the admin** in Settings. The default is 7:00 AM America/New_York.
* Digest contents:
  * Yesterday's signups, trials started and conversions, cancellations, downgrades and holds.
  * MRR change.
  * Failed payments, new locks, and accounts that have reached 80% or 100% of their limit.
  * New enterprise leads.
  * System health: failed jobs, webhook errors and bounces.
* Each alert type can be set to **digest** (the default), **instant email** or **off**. The alert types are: new signup, enterprise lead, failed payment, account locked, account hit its limit, and system error spike.
* A cron job runs every 15 minutes and sends the digest once the admin's chosen time has passed and that day's digest has not yet been sent.

## 14.18 Admin settings

* The admin's profile and email address.
* 2FA devices (passkeys and TOTP) and recovery codes.
* The digest time and timezone, and the alert preferences.
* The **IP allowlist** and the enforce toggle (§6.4).
* Platform settings: support email, the legal text versions (ESIGN consent, attestation, disclaimer), and the reserved slug list.

# 15. Data model

Every table has a `id` (UUIDv7) and `created_at`. Mutable tables also have `updated_at`. Tenant tables have `account_id`.

**Platform**

* `products` (code, name, is_active)
* `accounts`: name, slug, timezone, logo_file_id, contact information and address, `max_users_override`, `white_label_allowed`, `stripe_customer_id`, `status` (active, closed or pending_purge), `closed_at`
* `account_slug_history` (old_slug, redirect_until)
* `account_users` (account_id, email, name, is_owner, account_permissions[], status, last_login_at); also Better Auth tables for the account realm
* `account_user_product_permissions` (account_user_id, product_code, permissions[])
* `plans`: product_code, code, name, monthly_limit, max_users, price_monthly_cents, price_annual_cents, stripe_price_monthly_id, stripe_price_annual_id, white_label_allowed, features JSONB, is_public, is_trial, is_hold, is_custom, custom_account_id, archived_at
* `plan_versions`: plan_id, a snapshot of the plan, effective_mode (immediate, date or anniversary), effective_at, created_by_admin_id
* `product_subscriptions`: account_id, product_code, plan_id, interval, status, trial_ends_at, trial_limit, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, scheduled_plan_id, scheduled_change_at, coupon_id, locked_reason, locked_by (payment or admin)
* `usage_periods` (product_subscription_id, period_start, period_end, base_limit, bonus, used_count, warned_80_at, warned_100_at)
* `coupons`: code, name, type (percent, amount, free_months or bonus_waivers), value, duration (once, months or forever), duration_months, redeem_by, max_redemptions, once_per_customer, new_subscribers_only, product_code, plan_ids[], interval, stripe_coupon_id, stripe_promo_code_id, disabled_at
* `coupon_redemptions` (coupon_id, account_id, product_subscription_id, applied_by: customer or admin, override_reason)
* `stripe_events` (event_id unique, type, payload, processed_at, error)
* `billing_events` (account_id, product_code, type, amount_cents, tax_cents, stripe_ids, metadata), used for MRR and churn reporting
* `refunds_credits` (account_id, type, amount_cents, reason, stripe_id, admin_id)
* `feature_flags` (key, product_code, description, global_enabled, rollout_percent, plan_ids[]) and `feature_flag_overrides` (flag_id, account_id, enabled)
* `announcements` (title, body, link, severity, target_products[], target_plans[], show_to_visitors, starts_at, ends_at, dismissible) and `announcement_dismissals`
* `enterprise_leads` (company, contact, email, phone, volume, message, source, status, account_id)
* `admins` (email, name, role); also Better Auth tables for the admin realm, passkeys, TOTP and recovery codes
* `admin_settings` (digest_time, digest_tz, alert_prefs JSONB, ip_allowlist[], ip_enforce, support_email, legal_text_versions)
* `admin_notes` (account_id or visitor_id, body, pinned, admin_id, versions JSONB)
* `impersonation_sessions` (admin_id, target_type, target_id, started_at, ended_at, ip)
* `admin_audit_log`: append-only and permanent (admin_id, action, target_type, target_id, before, after, ip, user_agent, at)
* `audit_log`: the account-level log (account_id, actor_type, actor_id, impersonator_admin_id, action, entity, entity_id, metadata, ip, at)
* `digest_runs` (date, sent_at)
* `jobs` (type, payload, run_at, attempts, status, last_error) and `cron_runs`
* `files` (account_id, r2_key, content_type, size, sha256, kind)
* `integrations` (account_id, provider, encrypted tokens, config, status, last_sync_at)
* `purge_log`, `data_requests`

**Waiver**

* `waiver_templates` (account_id, name, slug, description, status, settings JSONB, current_version_id)
* `waiver_drafts`
* `waiver_versions`: immutable (template_id, version_number, schema, rendered_html, published_at, published_by, resign_policy, schema_hash)
* `waiver_settings` (account_id; the settings from §9.9)
* `visitors` (email, email_verified_at, name, phone, dob, address, is_shadow, deleted_at); also Better Auth tables for the visitor realm
* `submissions` (account_id, template_id, submitter_visitor_id, status, first_signed_at, last_full_signed_at, expires_at, current_revision_id, legal_hold, purge_after)
* `submission_revisions`: immutable (submission_id, revision_number, waiver_version_id, data, frozen_version_snapshot, reason, billing_counted, count_reason, prev_hash, data_hash, pdf_file_id, pdf_hash, created_by_visitor_id, channel)
* `participants` and `revision_participants`
* `signature_events`: immutable, with the fields from §8.2
* `cosign_invites` (revision_id, participant_id, email, token_hash, expires_at set to 15 days, used_at)
* `submission_drafts`, `marketing_optins`, `kiosk_devices`, `checkins`

**Indexes**:

* Trigram/GIN indexes on participant and visitor names, emails and phones.
* `(account_id, created_at desc)` on submissions and revisions.
* `(account_id, checked_in_at)` on check-ins.
* `(status)` on `product_subscriptions` and `jobs`.

# 16. API, jobs & security

## 16.1 API

* The web apps use Server Actions. The mobile apps use `/api/v1/*` (JSON validated with Zod, bearer tokens).
* Endpoint groups by app:
  * **`apps/app`** (`app.knoxumi.com/api/v1`, used by the Business app):
    * `auth` (account-user realm)
    * `account/*` (users, billing, settings)
    * `waiver/*` (templates, submissions, search, check-ins, reports)
    * `webhooks/stripe`, `webhooks/resend`, `webhooks/mailchimp`
    * `cron/*` (protected by `CRON_SECRET`)
  * **`apps/waiver`** (`waiver.knoxumi.com/api/v1`, used by the Kiosk app and visitor pages):
    * `auth` (visitor realm)
    * `public/{account}/{waiver}`
    * `visitor/*`
    * `cosign/*`
    * `kiosk/*`
    * `verify/{docId}`
* Kiosk device sessions are created through `apps/app`, by a staff user with the *Launch kiosk* permission. Each session is then exchanged for a **kiosk device token** that is only valid against `waiver.knoxumi.com/api/v1/kiosk/*`.
* `packages/api-client` exports two typed clients, `appClient` and `waiverClient`.
* The admin console has its own internal API, which is never exposed on `app.` or `waiver.`.

## 16.2 Scheduled jobs

All Vercel Cron schedules are defined in `apps/app/vercel.json` and run there. The job handlers live in `packages/`, so any app can enqueue a job, such as `apps/waiver` queueing a PDF after a signature. The jobs are:

* PDF generation
* Mailchimp sync
* Usage period rollover and the 80%/100% emails
* Trial reminders and expiry
* Visitor expiry reminders
* Detecting minors who have turned 18
* Expiring co-sign invites
* Scheduled plan price changes
* Starting and ending announcements
* The admin digest, checked every 15 minutes
* Retention purge, daily
* Building exports
* Health checks for overdue cron jobs

## 16.3 Security

* Data is encrypted in transit (TLS) and at rest (Neon and R2). Integration tokens get application-level envelope encryption.
* Sessions use host-only, HttpOnly, Secure, SameSite cookies, with a separate cookie name per realm. CSRF protection is on.
* Strict tenant scoping, plus tests that try cross-tenant access.
* A Content Security Policy is set, and rich text from the form builder is sanitized against an allow-list.
* Rate limiting covers auth, OTP, magic links, co-sign links, public endpoints and admin login.
* Admin: separate deployment, mandatory passkey/TOTP, an optional IP allowlist, and a permanent audit log.
* Stripe and Resend webhooks have their signatures verified.

## 16.4 Accessibility

* The visitor and kiosk flows meet WCAG 2.1 AA.
* The kiosk has large touch targets.
* Every field is fully labeled.

# 17. Marketing site **[DEFERRED: separate spec]**

Hooks that must exist now:

* `knoxumi.com` is the company site, and `knoxumi.com/waiver` (plus future product paths) are the product pages.
* The pricing page reads **public plans** from the platform, through a cached read-only endpoint, so price changes made in the admin console appear automatically.
* "Start free trial" links to `app.knoxumi.com/signup?product=waiver`.
* The "Contact us / Enterprise" form posts to the platform API and creates an `enterprise_leads` record.
* Legal pages (Terms, Privacy, DPA) are hosted here and versioned. Signup records which version the user accepted.

# 18. Delivery phases

1. **Platform foundation**:
   * Monorepo, database schema, and the three auth realms.
   * Accounts, products, users and permissions, and the user cap.
   * R2, Resend and audit logging.
2. **Admin core**:
   * Admin auth (passkey and TOTP, the IP allowlist feature).
   * Accounts list and detail, notes, manual account creation, impersonation.
   * The admin audit log.
3. **Waiver form builder**: editor, fields, validation, groups, conditional logic, versioning and preview.
4. **Waiver signing**:
   * Visitor pages, accounts and guests.
   * Signatures, evidence, PDFs, hashes and the audit page.
   * Revisions, co-signing, expiry and renewal, re-sign, and turning 18.
5. **Company operations**: lists, search, detail, check-in and check-out, reports, exports and Mailchimp.
6. **Billing**:
   * Stripe products and prices, Stripe Tax, checkout, the portal and webhooks.
   * Usage counting, banners and the state machine.
   * Retries and locking, Hold, downgrades and cancellation.
   * Coupons.
7. **Admin billing & ops**:
   * Plans and price-change propagation, coupons UI, refunds and credits.
   * Billing operations, the dashboard and reports.
   * Enterprise leads, announcements, feature flags, system health, and the digest and alerts.
8. **Apps**: the kiosk (web and Expo), then the Business app (native screens plus WebView).
9. **Hardening**: retention purge, delete-my-data, security review, load testing and an accessibility audit.
10. **Later**: marketing site, push notifications, offline mode, bundle discounts, more integrations, multiple locations, more languages, Address Validation API, and more admin users with roles.

# 19. Acceptance criteria

**Platform**

1. One account can hold subscriptions to several products. Each has its own trial, plan, Stripe subscription and status. Locking one product does not affect another.
2. Account users are shared across products. A user beyond the effective cap (the override, else the plan's max, else 3) cannot be invited.
3. Every invoice has tax calculated by Stripe Tax.

**Visitors & waivers**

4. A visitor can sign up with an email and log in by password, magic link or a 6-digit code. They only see data for the company in the URL.
5. A company can build a waiver with every field type, conditional logic and a repeating children group, publish it, and reach it at `waiver.knoxumi.com/{company}/{waiver}`.
6. After a new version is published, earlier submissions still render exactly as they were signed, on the web and in the PDF.
7. Every signature stores the IP, user agent, device, timestamp, auth method and channel. The PDF audit page shows the hashes, and `/verify/{docId}` confirms the document is intact.
8. Take a family waiver with 2 adults and 4 kids. Once the submitter signs, the second adult shows as *Pending* and gets a link valid for 15 days. That adult cannot be checked in until they sign. All 4 kids can be checked in.
9. Adding a child creates a new revision. The submitter must re-sign and the other adults go back to pending. Usage does **not** increase.
10. A renewal after expiry is pre-filled, and **does** increase usage.
11. When "require re-sign" was chosen at publish, participants on older versions are blocked at check-in.

**Billing**

12. At 80% usage, every company screen shows the waivers and days remaining. At 100%, new waivers and renewals are blocked, visitors see the neutral message, and an upgrade unblocks signing immediately.
13. A trial ends at 14 days or 20 waivers, whichever comes first. The product then becomes view and export only.
14. After 3 daily retries fail, the product is locked: no new waivers, edits or check-ins. Paying restores it.
15. On Hold, no new waivers, edits or check-ins are allowed. The company can view and export, and visitors can log in and download.
16. Cancelling takes effect at period end and gives no refund.
17. A coupon cannot be stacked. Its once-per-customer, new-subscribers-only, scope and expiry rules are all enforced. Bonus-waiver coupons raise the period limit.

**Apps**

18. The kiosk needs the PIN to exit, has no timeout during the form, auto-resets after a submission, and has no access to any company function.
19. The Business app shows the native check-in and list screens, and every other permitted function through the WebView.

**Admin**

20. Admin login requires a passkey or TOTP. When the IP allowlist is on, other IPs are rejected, and the break-glass environment variable restores access.
21. The admin can create an account with an enterprise plan and send the card link.
22. The admin can impersonate an account user or a visitor. The target is not notified. Every action is audited, and signing is impossible during impersonation.
23. When a plan's price or limit changes, the admin is asked to choose immediately, on a date, or on the anniversary. Existing subscribers then change on exactly that schedule.
24. The admin can issue a full or partial refund or a credit. The plan and status do not change.
25. Deleting an account closes it immediately, but signed waivers stay until their retention period ends.
26. Announcements appear only to the targeted products or plans, and only between their start and end times.
27. Feature flags respect the global switch, the rollout percentage and the per-account overrides.
28. Failed jobs and webhooks can be retried or replayed from System Health.
29. The digest arrives at the time the admin set. Alerts set to instant are emailed immediately.
30. Every admin action appears in the permanent admin audit log. Every report exports to CSV.

# 20. Decisions log

| # | Topic | Decision |
|---|---|---|
| 1–3 | Stack and hosting | Next.js on Vercel, Neon Postgres, Resend |
| 2 | Mobile | React Native with Expo |
| 4 | Payments | Stripe Billing |
| 5 / 38 | URLs | `waiver.knoxumi.com/[company]/[waiver]`, with `knoxumi.com` for marketing |
| 6 | Locations | Multiple active waivers; no multi-location support in v1 |
| 7 | Visitor accounts | Global, but visitors only see the current company's data |
| 8 / 42 | Login | Email magic link, plus a 6-digit code (used on the kiosk and available everywhere) |
| 9 | Guest signing | Company setting; the default requires an account |
| 10 / 34 | Signing | Any change requires the submitter to re-sign. One adult covers the minors. Every adult must sign before check-in. |
| 11 | Expiry | Company setting, 1 year by default |
| 12 | Signature type | Drawn and/or typed, set by the company |
| 13 | Evidence | Everything obtainable |
| 15 / 32 (admin) | Retention | Company setting, 3 years by default. Always honored, including when an account is deleted. |
| 17–19 | Builder | All field types except photo, with validation overrides, conditional logic, and draft then publish |
| 20 / 25 / 45 | Users | Custom permissions. Users are shared across products. The cap is per account (plan default 3, plus an account override). |
| 21 | Check-ins | Company setting. Check-out is a separate setting, off by default. |
| 22 / 49 | Marketing | Email and SMS opt-ins through Mailchimp, set up per account |
| 24 | Branding | Knoxumi by default; white-label when an admin allows it |
| 25–31 | Billing | Counted per submission, on the anniversary. Upgrades are immediate and prorated. Downgrades happen at the next period. No-card trial of 14 days or 20 waivers, then read-only. 3 daily payment retries, then lock. Hold blocks everything. Annual billing is 15% off. |
| 35 | Counting | Edits don't count; renewals do |
| 36 | Publishing | Both re-sign options available |
| 41 / 10 | Kiosk | A separate app, signing only, with a PIN exit and auto-reset after submit |
| 40 (admin) | Business app | All company functions: native daily-ops screens plus a WebView for the rest |
| 43 (admin) | Trials | Per product |
| 46 (admin) | Admin audit | Permanent |
| 52 / 53 / 54 | Infra | Cloudflare R2, Better Auth, Turborepo |
| 56 | Address checks | Google Places, paid by Knoxumi |
| 57 | Disclaimer | Included |
| Admin 1–3 / 22–24 | Admin access | One admin, mandatory 2FA (passkey plus TOTP), optional IP allowlist, `admin.knoxumi.com` as a separate deployment, and impersonation of account users and visitors |
| Admin 4–5 / 26 | Multi-product | One account with several products, one console with a product switcher, and a separate Stripe subscription per product |
| Admin 7–8 | Impersonation & visibility | Full access, not notified, audited. The admin can view everything. |
| Admin 9 / 33 | Refunds | Issued from the admin console. Cancellation gives no refund and happens at period end. |
| Admin 10 | Price changes | Immediately, on a date, or on the anniversary, chosen per change |
| Admin 12 / 28–31 | Coupons | Percent, amount, free months or bonus waivers. Once per customer, once total, new subscribers only. Scoped by product and plan. One per subscription. Applied by code or by the admin. |
| Admin 13–15 / 34 | Reporting | All metrics, a daily digest at a time the admin sets, and CSV export |
| Admin 16–20 / 35–36 | Ops | Account notes (outside ticketing tool), enterprise leads, system health with retry, targeted and scheduled announcements, feature flags (global, rollout and per account) |
| Admin 37 | Tax | Stripe Tax collects automatically |
| Admin 39 | Docs | One merged platform spec |
| Admin 44 | Manual accounts | The admin can create accounts, including enterprise accounts |
| Brand | Colors | Blue `#1964d3`, dark blue `#053aa2`, light orange `#fc870e` and dark orange `#d35900`, applied across all surfaces with the contrast rules in §3.4 |
| Repo & deploy | Structure | One GitHub monorepo. Separate apps and Vercel projects for marketing, app (the back office for all products), waiver (public) and admin. Staging uses `*.staging.knoxumi.com` on the `staging` branch. |
| Assumption | Impersonation signing | Signing is blocked while impersonating, to protect the evidence's integrity |
