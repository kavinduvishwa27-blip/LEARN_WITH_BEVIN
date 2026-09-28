# Freelancer College website + admin panel

The website for Freelancer College (Learn With Bevin (Pvt) Ltd), built from
`learn-with-bevin-website-blueprint.md`, plus an admin panel at **`/admin`** for
website content, leads, enrollments and payments.

It runs on Cloudflare Pages with a Cloudflare D1 database and needs **no Node.js**.
The build is one Python file that uses only the standard library.

## Run it locally

```bash
py build.py serve
```

- Public website: http://localhost:8788
- ERP / admin panel: http://localhost:8788/erp (local preview password **demo**)

Locally, the admin panel runs in **preview mode**: it uses a test database stored in your
browser, so you can try everything safely. Edits made there do not change the local
website pages. On Cloudflare, edits go live on the public site.

The site rebuilds automatically whenever you save a file. On macOS or Linux, use `python3`.

## How the admin panel works

- **Website content** (batch dates and prices, webinar, curriculum, bonuses, FAQs,
  testimonials, blog posts, legal pages, contact details, bank details, analytics IDs...)
  is edited in the panel and stored in the database. Saved changes appear on the live
  site **within about 10 seconds**, with no rebuild.
- **Leads:** every form on the site (webinar, free resources, contact, business, waitlist,
  quiz, newsletter) lands here. Set a status, add notes, WhatsApp them, export CSV.
- **Enrollments:** every checkout creates one. Record payments as they arrive. The status
  (awaiting payment, deposit paid, paid in full) and the **seats left** on the website update
  automatically. Card payments through PayHere are recorded automatically.
- **Activity log** of every change, and a **one-click backup** of everything.

How it's built: every page is also saved as a template (`dist/_tpl/`). On each request,
`Public/server/middleware.js` fills the template with the live content from the database
(`Public/server/template.js`, the same template language as `build.py`). If the database is not
connected, or anything fails, the normal pre-built page is served, so the site never breaks.

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repo (for example `Bevin905/freelancer-college`).
2. In Cloudflare, go to **Workers & Pages > Create > Pages > Connect to Git** and pick the repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `python build.py`
   - **Build output directory:** `dist`
4. Deploy, then add your custom domain `freelancercollege.lk` under **Custom domains**.

### Connect the database (needed for the admin panel)

1. Cloudflare dashboard > **Storage & Databases > D1 > Create database**. Name it `freelancer-college`.
2. Your Pages project > **Settings > Bindings > Add > D1 database**.
   Variable name **`DB`**, database `freelancer-college`. Do this for Production (and Preview if you use it).
3. The tables are created automatically on first use.

### Protect the admin panel (pick one)

- **Quick: admin password.** Your Pages project > **Settings > Variables and Secrets > Add**,
  type **Secret**, name **`ADMIN_PASSWORD`**, a long password. Redeploy.
- **Stronger: Cloudflare Access** (free, email one-time codes, no password to leak).
  Zero Trust > Access > Applications > Add > Self-hosted, for `freelancercollege.lk/admin*`
  and `freelancercollege.lk/api/admin*`, allowing only your emails. Then add the variables
  **`ACCESS_TEAM_DOMAIN`** (e.g. `yourteam.cloudflareaccess.com`) and **`ACCESS_AUD`**
  (the application's "Application Audience (AUD) Tag"). Optional: **`ADMIN_EMAILS`**
  (comma separated) to limit who may use the panel.

Then open `https://freelancercollege.lk/admin`.

## Other settings (Settings > Variables and Secrets)

All optional. Each one switches on another integration.

| Variable | Turns on |
|---|---|
| `RESEND_API_KEY` + `NOTIFY_EMAIL` (+ `FROM_EMAIL`) | An email to you for every lead, enrollment and contact message |
| `N8N_WEBHOOK_URL` (+ `N8N_WEBHOOK_SECRET`) | Every form and payment is posted to n8n for WhatsApp/ManyChat, email sequences, Sheets and CRM |
| `PAYHERE_MERCHANT_ID` + `PAYHERE_SECRET` (+ `PAYHERE_SANDBOX=true` for testing) | Card payments at checkout. Prices come from the admin panel. Payments are recorded automatically |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) | The AI gig generator on `/tools`. Without it, a template generator is used |
| `TURNSTILE_SECRET` | Bot protection. Add the Turnstile widget to the forms when you enable it |
| KV binding `LEADS` | Per-IP rate limiting on forms |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Also copy leads and payments to Supabase |

## Project layout

The project is split into two folders. Each is found by its marker file, so you can
rename or move them anywhere inside the project and everything keeps working.

```
Public/                  THE PUBLIC WEBSITE          (marker: public.config.json)
  pages/                 one file per page (front matter + HTML template)
  partials/              reusable sections, included with {{> name }}
  layouts/               base.html (head, nav, footer) and post.html (blog posts)
  assets/                CSS, JS, images
  data/site.json         starting settings: prices, dates, contact details...
  data/content.json      starting FAQs, testimonials, curriculum, bonuses, blog posts, legal pages
  static/                _headers, _redirects, robots.txt
  server/                code that serves the site: live content, forms, payments, AI tool

erp/                     THE ERP / ADMIN PANEL       (marker: erp.config.json)
  panel/                 the panel itself (served at /admin, also /erp)
  panel/schema.js        what is editable, and how each field looks
  server/                database, login, leads, enrollments, payments, content saving

build.py                 builds both into dist/ and runs the local server
functions/               tiny connector files Cloudflare requires at the top level
_server/                 generated on every build from Public/server + erp/server
```

How the two stay in sync: they share one database on Cloudflare. The ERP writes to it,
the public site reads from it on every page view. Public forms and payments write to it,
the ERP shows them.

The files in `Public/data/` are the **starting content**. Once something is saved in the ERP,
the database version wins. "Restore original content" in the ERP goes back to these files.

**To make a new field editable:** add it to `Public/data/site.json` (or `content.json`), use it
in a page as `{{ site.group.field }}`, and add it to the section in `erp/panel/schema.js`.

## Copy rules (from the blueprint)

- Never use em dashes in copy. `grep -rn "—" Public erp` should return nothing.
- Every page ends with one clear next step.
- Freelancer X Module 7 (getting paid from Sri Lanka) is never free and never previewed.
