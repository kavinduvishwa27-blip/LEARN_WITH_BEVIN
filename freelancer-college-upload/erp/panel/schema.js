// Every editable part of the website, and how the admin panel shows it.
// key: where it is stored ("site.cohort" = settings group, "faqs" = collection)
// Field types: text, textarea, html (rich text), number, date, datetime (Sri Lanka time),
//   url, email, color, bool, select, tags (list of words), list (repeatable items), group,
//   image (upload or pick from the image library; stores a /media/... link).

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] ? +m[4] : null, mi: m[5] ? +m[5] : null, wd: d.getUTCDay() };
};
export const humanDate = (iso, withDay) => {
  const p = parts(iso);
  if (!p) return "";
  return `${withDay ? WEEKDAYS[p.wd] + ", " : ""}${p.d} ${MONTHS[p.mo - 1]} ${p.y}`;
};
export const humanTime = (iso) => {
  const p = parts(iso);
  if (!p || p.h === null) return "";
  const h12 = p.h % 12 || 12;
  return `${h12}.${String(p.mi).padStart(2, "0")} ${p.h < 12 ? "am" : "pm"}`;
};
const eventWhen = (iso) => (iso ? `${humanDate(iso)}${humanTime(iso) ? ", " + humanTime(iso) : ""}` : "No date yet");
const isPast = (x) => {
  const end = Date.parse(x.ends_at || "") || (Date.parse(x.starts_at || "") + 3 * 36e5);
  return !!end && end < Date.now();
};
const digits = (v) => String(v || "").replace(/[^\d]/g, "");
const money = (v) => { const n = digits(v); return n ? Number(n).toLocaleString("en-US") : ""; };

export const SECTIONS = [
  // ---------------------------------------------------------------- Courses
  {
    id: "cohort", group: "Courses", key: "site.cohort", title: "Designer X batch", icon: "calendar",
    view: "/courses/designer-x",
    help: "Dates, prices and seats for the current Designer X batch. Used on the home page, Designer X page, checkout and payments.",
    fields: [
      { k: "name", label: "Batch name", type: "text", placeholder: "November 2026" },
      { k: "status", label: "Status label", type: "select", options: ["Enrolling", "Few seats left", "Waitlist", "Sold out"] },
      { k: "start_date", label: "Start date", type: "date" },
      { k: "start_human", label: "Start date as shown", type: "text", hint: "Filled in automatically from the start date. You can edit it." },
      { k: "schedule", label: "Schedule", type: "textarea", rows: 2 },
      { k: "weeks", label: "Weeks", type: "number", half: true },
      { k: "days", label: "Days", type: "number", half: true },
      { k: "seats", label: "Total seats", type: "number", half: true },
      { k: "seats_left", label: "Seats left", type: "number", half: true, hint: "Goes down automatically when you mark an enrollment as paid." },
      { k: "currency", label: "Currency", type: "text", half: true },
      { k: "price_regular", label: "Full course fee", type: "text", half: true, format: "money" },
      { k: "early_discount_pct", label: "Early bird discount (%)", type: "number", half: true },
      { k: "price_early", label: "Early bird price", type: "text", half: true, format: "money", hint: "Worked out from the fee and the %. Total for the deposit plan." },
      { k: "full_discount", label: "Extra discount for paying in full", type: "text", half: true, format: "money" },
      { k: "price_full", label: "Pay in full price", type: "text", half: true, format: "money", hint: "Early bird price minus the extra discount. Charged at checkout." },
      { k: "deposit", label: "Seat deposit", type: "text", half: true, format: "money" },
      { k: "balance", label: "Balance after deposit", type: "text", half: true, format: "money", hint: "Early bird price minus the deposit." },
      { k: "early_bird_deadline", label: "Early bird ends", type: "datetime" },
      { k: "early_bird_human", label: "Early bird end as shown", type: "text" },
      { k: "balance_due_date", label: "Balance due by", type: "date", half: true, hint: "Everyone who pays the deposit pays the rest by this date." },
      { k: "balance_due_human", label: "Balance date as shown", type: "text", half: true },
    ],
    derive(v, changed) {
      if (changed === "start_date") v.start_human = humanDate(v.start_date, true);
      if (changed === "early_bird_deadline") v.early_bird_human = humanDate(v.early_bird_deadline);
      if (changed === "balance_due_date") v.balance_due_human = humanDate(v.balance_due_date);
      const n = (k) => Number(digits(v[k])) || 0;
      for (const k of ["price_regular", "price_early", "full_discount", "price_full", "deposit", "balance"]) if (changed === k) v[k] = money(v[k]);
      // keep the price chain in sync: fee -> early bird -> pay in full / balance
      if (["price_regular", "early_discount_pct"].includes(changed) && v.early_discount_pct !== "") v.price_early = money(String(Math.round(n("price_regular") * (1 - (Number(v.early_discount_pct) || 0) / 100))));
      if (["price_regular", "early_discount_pct", "price_early", "full_discount"].includes(changed)) v.price_full = money(String(Math.max(0, n("price_early") - n("full_discount"))));
      if (["price_regular", "early_discount_pct", "price_early", "deposit"].includes(changed)) v.balance = money(String(Math.max(0, n("price_early") - n("deposit"))));
      v.price_early_value = digits(v.price_early);
      v.price_full_value = digits(v.price_full);
      v.deposit_value = digits(v.deposit);
    },
  },
  {
    id: "curriculum", group: "Courses", key: "curriculum", title: "Designer X curriculum", icon: "list", view: "/courses/designer-x#curriculum",
    help: "Phases and weekly modules shown on the Designer X page.",
    type: "list", itemTitle: (x) => x.title || "New phase", itemSub: (x) => x.label,
    newItem: () => ({ label: "Phase · Weeks", title: "", modules: [] }),
    fields: [
      { k: "label", label: "Phase label", type: "text", placeholder: "Phase 1 · Foundation · Weeks 1 to 4" },
      { k: "title", label: "Phase title", type: "text" },
      {
        k: "modules", label: "Modules", type: "list", itemTitle: (x) => `${x.num || "?"} · ${x.title || "New module"}`,
        newItem: () => ({ num: "", title: "", body: "", tags: [], project: false }),
        fields: [
          { k: "num", label: "Week number", type: "text", half: true },
          { k: "project", label: "Portfolio project", type: "bool", half: true },
          { k: "title", label: "Title", type: "text" },
          { k: "body", label: "Description", type: "textarea", rows: 4 },
          { k: "tags", label: "Tags", type: "tags" },
        ],
      },
    ],
  },
  {
    id: "students", group: "Courses", key: "students", title: "Student group", icon: "leads",
    help: "Shown only to students whose payment is confirmed, on their checkout page, right after their slip is checked (or their card payment goes through). It never appears on the public website.",
    fields: [
      { k: "group_link", label: "Batch group link", type: "url", placeholder: "https://chat.whatsapp.com/...", hint: "The WhatsApp (or Telegram) invite link for the current batch. Change it for each new batch." },
      { k: "welcome_title", label: "Welcome headline", type: "text" },
      { k: "welcome_text", label: "Welcome message", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "bonuses", group: "Courses", key: "bonuses", title: "Designer X bonuses", icon: "gift", view: "/courses/designer-x",
    type: "list", itemTitle: (x) => x.title || "New bonus", itemSub: (x) => x.label,
    newItem: () => ({ label: "BONUS", title: "", body: "", value: "Included", note: "" }),
    fields: [
      { k: "label", label: "Label", type: "text", half: true },
      { k: "value", label: "Value text", type: "text", half: true },
      { k: "title", label: "Title", type: "text" },
      { k: "body", label: "Description", type: "textarea", rows: 3 },
      { k: "note", label: "Small note", type: "text" },
    ],
  },
  {
    id: "designer_x", group: "Courses", key: "site.designer_x", title: "Designer X page text", icon: "type", view: "/courses/designer-x",
    fields: [
      { k: "hero_line1", label: "Headline, line 1", type: "text" },
      { k: "hero_line2", label: "Headline, line 2 (red)", type: "text" },
      { k: "hero_lead", label: "Intro paragraph", type: "textarea", rows: 3, hint: "You can insert live values, e.g. {{ site.cohort.days }}." },
    ],
  },
  {
    id: "linux", group: "Courses", key: "site.linux", title: "Linux Master", icon: "terminal", view: "/courses/linux-master",
    fields: [
      { k: "status", label: "Status label", type: "text", placeholder: "Coming soon" },
      { k: "lessons", label: "Lessons", type: "text", half: true },
      { k: "hours", label: "Hours of video", type: "text", half: true },
    ],
  },
  // ---------------------------------------------------------------- Marketing
  {
    id: "events", group: "Marketing", key: "events", title: "Events", icon: "star", view: "/events",
    help: "Webinars, workshops, meetups and announcements. Upcoming events appear on the Events page, and the ones marked \"Show on home page\" also appear on the home page. Events disappear from the upcoming list by themselves once they end.",
    type: "list", addLabel: "event",
    itemTitle: (x) => x.title || "New event",
    itemSub: (x) => [eventWhen(x.starts_at), x.published === false ? "Draft" : isPast(x) ? "Ended" : x.featured === false ? "Events page only" : "Home page + Events page"].filter(Boolean).join(" · "),
    newItem: () => ({ title: "", type: "Live webinar", starts_at: "", ends_at: "", place: "Online on Zoom", image: "", summary: "", notes: "<p></p>", button: "Register now", link: "/webinar", featured: true, published: true }),
    fields: [
      { k: "title", label: "Event name", type: "text", placeholder: "Figma for beginners: live workshop" },
      { k: "type", label: "Type", type: "select", half: true, options: ["Live webinar", "Workshop", "Masterclass", "Meetup", "Batch start", "Announcement"] },
      { k: "place", label: "Where", type: "text", half: true, placeholder: "Online on Zoom, or an address" },
      { k: "starts_at", label: "Starts", type: "datetime", half: true },
      { k: "ends_at", label: "Ends (optional)", type: "datetime", half: true, hint: "Sri Lanka time. Leave empty and it counts as 3 hours long." },
      { k: "image", label: "Image or poster", type: "image", hint: "A wide image works best (16:9). Large photos are made smaller automatically." },
      { k: "summary", label: "Short description", type: "textarea", rows: 2, hint: "One or two sentences for the event card." },
      { k: "notes", label: "Full notes", type: "html", hint: "Shown on the Events page: agenda, who it is for, what to bring..." },
      { k: "button", label: "Button text", type: "text", half: true, placeholder: "Register now" },
      { k: "link", label: "Button link", type: "text", half: true, placeholder: "/webinar", hint: "A page (/webinar), any https:// link, or #book-seat to open seat booking." },
      { k: "featured", label: "Show on home page", type: "bool", half: true },
      { k: "published", label: "Published", type: "bool", half: true },
    ],
  },
  {
    id: "popup", group: "Marketing", key: "site.popup", title: "Pop-up announcement", icon: "megaphone", view: "/?popup=preview",
    help: "A window that appears a few seconds after someone opens the website, for a new event, a new batch or any message. Each visitor sees it once, then again after the number of days you choose. When you change the text or image, everyone sees the new version. \"View on website\" shows it straight away.",
    fields: [
      { k: "enabled", label: "Show the pop-up", type: "bool" },
      { k: "eyebrow", label: "Small label", type: "text", half: true, placeholder: "New event" },
      { k: "title", label: "Headline", type: "text", half: true },
      { k: "message", label: "Message", type: "textarea", rows: 4 },
      { k: "image", label: "Image (optional)", type: "image", hint: "Shown beside the message, or above it on phones." },
      { k: "image_alt", label: "Image description (for screen readers)", type: "text" },
      { k: "button", label: "Button text", type: "text", half: true },
      { k: "link", label: "Button link", type: "text", half: true, hint: "/events, /webinar, https://... or #book-seat to open seat booking." },
      { k: "dismiss", label: "Close text", type: "text", half: true, placeholder: "Maybe later" },
      { k: "show_on", label: "Show on", type: "select", half: true, options: ["Every page", "Home page only"] },
      { k: "delay_seconds", label: "Appear after (seconds)", type: "number", half: true },
      { k: "repeat_days", label: "Show again after (days)", type: "number", half: true, hint: "0 = once per visit." },
      { k: "starts_at", label: "Start showing (optional)", type: "datetime", half: true },
      { k: "ends_at", label: "Stop showing (optional)", type: "datetime", half: true, hint: "Sri Lanka time. Empty = no limit." },
    ],
    // a new message counts as a new pop-up, so visitors who closed the old one see it
    derive(v, changed) {
      if (["eyebrow", "title", "message", "image", "button", "link", "enabled"].includes(changed)) v.version = String(Date.now());
    },
  },
  {
    id: "webinar", group: "Marketing", key: "site.webinar", title: "Free webinar", icon: "video", view: "/webinar",
    help: "The next webinar. The countdowns on the site use the date and time.",
    fields: [
      { k: "title", label: "Title", type: "text" },
      { k: "starts_at", label: "Starts at", type: "datetime" },
      { k: "human", label: "Date as shown", type: "text", hint: "Filled in automatically from the start time." },
      { k: "duration_min", label: "Length (minutes)", type: "number", half: true },
      { k: "platform", label: "Platform", type: "text", half: true },
      { k: "bonus_pdf", label: "Bonus PDF link", type: "url" },
    ],
    derive(v, changed) {
      if (changed === "starts_at") v.human = `${humanDate(v.starts_at, true)} at ${humanTime(v.starts_at)}`;
    },
  },
  {
    id: "seat_booking", group: "Marketing", key: "seat_booking", title: "Seat booking", icon: "enroll", view: "/courses/designer-x",
    help: "The questions people answer when they click \"Book your seat\". Afterwards they go to checkout to pay (Linux Master answers go to its waitlist, \"Not sure\" goes to the free webinar, \"discuss\" opens a WhatsApp chat with you). Everyone who starts appears in Leads as \"Booking started\" with their answers.",
    fields: [
      { k: "title", label: "Window title", type: "text" },
      { k: "intro", label: "Intro text", type: "textarea", rows: 2 },
      {
        k: "questions", label: "Questions", type: "list", itemTitle: (x) => x.q || "New question", itemSub: (x) => `${(x.options || []).length} answers`,
        newItem: () => ({ q: "", options: [] }),
        fields: [
          { k: "q", label: "Question", type: "text" },
          { k: "options", label: "Answer choices", type: "tags", allowCommas: true, hint: "Type an answer and press Enter. Keep 2 to 5 choices." },
        ],
      },
      { k: "details_title", label: "Details step heading", type: "text" },
      { k: "button", label: "Final button text", type: "text" },
    ],
  },
  {
    id: "home", group: "Marketing", key: "site.home", title: "Home page text", icon: "home", view: "/",
    fields: [
      { k: "hero_line1", label: "Headline, line 1", type: "text" },
      { k: "hero_line2", label: "Headline, line 2", type: "text" },
      { k: "hero_line3", label: "Headline, line 3 (red)", type: "text" },
      { k: "hero_lead", label: "Intro paragraph", type: "textarea", rows: 3 },
      { k: "final_title", label: "Closing call to action", type: "text", half: true },
      { k: "final_accent", label: "Closing accent (red)", type: "text", half: true },
    ],
  },
  {
    id: "testimonials", group: "Marketing", key: "testimonials", title: "Testimonials", icon: "quote", view: "/success-stories",
    help: "Featured ones appear in the home page carousel. Quotes (not videos) appear on Success Stories.",
    type: "list", itemTitle: (x) => x.video ? `Video: ${x.name}` : (x.quote || "New testimonial").slice(0, 70), itemSub: (x) => x.tag,
    newItem: () => ({ video: false, quote: "", name: "", tag: "", initials: "", color: "#7f1d1d", filter: "first-order", before: "", did: "", result: "", video_url: "", caption: "", featured: true }),
    fields: [
      { k: "video", label: "This is a video story", type: "bool", half: true },
      { k: "featured", label: "Show on home page", type: "bool", half: true },
      { k: "quote", label: "Quote", type: "textarea", rows: 3, showIf: (x) => !x.video },
      { k: "video_url", label: "Video link (TikTok, YouTube, Bunny)", type: "url", showIf: (x) => x.video },
      { k: "caption", label: "Video caption", type: "text", showIf: (x) => x.video },
      { k: "name", label: "Name", type: "text", half: true },
      { k: "tag", label: "Result line", type: "text", half: true, placeholder: "First order, week 6" },
      { k: "initials", label: "Initials", type: "text", half: true },
      { k: "color", label: "Avatar color", type: "color", half: true },
      { k: "filter", label: "Story filter", type: "select", options: ["first-order", "full-time", "portfolio"], showIf: (x) => !x.video },
      { k: "before", label: "Before", type: "text", showIf: (x) => !x.video },
      { k: "did", label: "What they did", type: "text", showIf: (x) => !x.video },
      { k: "result", label: "Result", type: "text", showIf: (x) => !x.video },
    ],
  },
  {
    id: "faqs", group: "Marketing", key: "faqs", title: "FAQs", icon: "help", view: "/faq",
    help: "Answers can use simple HTML such as links, and live values like {{ site.cohort.deposit }}.",
    type: "group",
    fields: ["home|Home page and FAQ page", "designer_x|Designer X page", "linux|Linux Master page", "payments|FAQ page: enrollment and payments", "during|FAQ page: during the program"].map((s) => {
      const [k, label] = s.split("|");
      return {
        k, label, type: "list", itemTitle: (x) => x.q || "New question", newItem: () => ({ q: "", a: "" }),
        fields: [{ k: "q", label: "Question", type: "text" }, { k: "a", label: "Answer", type: "textarea", rows: 3 }],
      };
    }),
  },
  {
    id: "posts", group: "Marketing", key: "posts", title: "Blog posts", icon: "pen", view: "/blog",
    help: "New posts go live at /blog/your-slug as soon as you save. Untick Published to hide one.",
    type: "list", itemTitle: (x) => x.title || "New post", itemSub: (x) => `${x.date || ""} · ${x.category || ""}${x.published === false ? " · Draft" : ""}`,
    newItem: () => ({ slug: "", title: "", seo_title: "", description: "", category: "Freelancing", cover: "", date: new Date().toISOString().slice(0, 10), published: false, body: "<p></p>" }),
    fields: [
      { k: "title", label: "Title", type: "text" },
      { k: "slug", label: "URL slug", type: "text", hint: "Letters, numbers and dashes only. The post lives at /blog/slug.", pattern: "^[a-z0-9-]+$" },
      { k: "seo_title", label: "Browser tab / Google title", type: "text" },
      { k: "description", label: "Summary", type: "textarea", rows: 2 },
      { k: "category", label: "Category", type: "select", options: ["UI/UX", "Figma", "Freelancing", "Pricing", "Fiverr", "Career"], half: true },
      { k: "date", label: "Publish date", type: "date", half: true },
      { k: "cover", label: "Cover text", type: "text", half: true, hint: "Big words shown on the post card." },
      { k: "published", label: "Published", type: "bool", half: true },
      { k: "body", label: "Article", type: "html" },
    ],
    // Only for posts created in this session, and only until you type in those fields yourself
    derive(v, changed, ctx) {
      if (changed !== "title" || !ctx.fresh) return;
      if (!ctx.touched.has("slug")) v.slug = (v.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
      if (!ctx.touched.has("seo_title")) v.seo_title = v.title ? `${v.title} | Freelancer College` : "";
    },
  },
  // ---------------------------------------------------------------- Settings
  {
    id: "contact", group: "Settings", key: "site.contact", title: "Contact details", icon: "phone", view: "/contact",
    fields: [
      { k: "email", label: "Email", type: "email" },
      { k: "phone_display", label: "Phone as shown", type: "text", half: true },
      { k: "phone_tel", label: "Phone for calling (+94...)", type: "text", half: true },
      { k: "whatsapp", label: "WhatsApp number (94XXXXXXXXX, no +)", type: "text" },
      { k: "whatsapp_text", label: "WhatsApp prefilled message", type: "text" },
      { k: "hours", label: "Business hours", type: "text" },
      { k: "map_embed", label: "Google Maps embed link", type: "url" },
    ],
  },
  {
    id: "brand", group: "Settings", key: "site.brand", title: "Company & brand", icon: "building", view: "/about",
    fields: [
      { k: "name", label: "Brand name", type: "text", half: true },
      { k: "company", label: "Company name", type: "text", half: true },
      { k: "reg_no", label: "Registration number", type: "text", half: true },
      { k: "founder", label: "Founder", type: "text", half: true },
      { k: "address", label: "Address", type: "text" },
      { k: "tagline", label: "Tagline", type: "textarea", rows: 2 },
      { k: "year", label: "Copyright year", type: "text", half: true },
    ],
  },
  {
    id: "stats", group: "Settings", key: "site.stats", title: "Numbers & proof", icon: "chart", view: "/",
    fields: [
      { k: "students", label: "Students trained", type: "number", half: true },
      { k: "years", label: "Years freelancing", type: "number", half: true },
      { k: "assignments", label: "Assignments per batch", type: "number", half: true },
    ],
  },
  {
    id: "social", group: "Settings", key: "site.social", title: "Social links", icon: "share", view: "/community",
    fields: [
      { k: "tiktok", label: "TikTok", type: "url" },
      { k: "facebook", label: "Facebook", type: "url" },
      { k: "youtube", label: "YouTube", type: "url" },
      { k: "fiverr", label: "Fiverr", type: "url" },
      { k: "whatsapp_group", label: "WhatsApp community group", type: "url" },
    ],
  },
  {
    id: "links", group: "Settings", key: "site.links", title: "Student portal link", icon: "link",
    fields: [{ k: "login", label: "Student login URL", type: "url" }],
  },
  {
    id: "bank", group: "Settings", key: "site.bank", title: "Bank details", icon: "bank", view: "/checkout/success",
    help: "Shown to students after they choose bank transfer.",
    fields: [
      { k: "bank", label: "Bank", type: "text", half: true },
      { k: "branch", label: "Branch", type: "text", half: true },
      { k: "account_name", label: "Account name", type: "text" },
      { k: "account_no", label: "Account number", type: "text" },
    ],
  },
  {
    id: "analytics", group: "Settings", key: "site.analytics", title: "Analytics & pixels", icon: "activity",
    help: "Loaded only after a visitor accepts analytics cookies.",
    fields: [
      { k: "ga4_id", label: "Google Analytics 4 ID", type: "text", placeholder: "G-XXXXXXX" },
      { k: "meta_pixel_id", label: "Meta Pixel ID", type: "text" },
      { k: "tiktok_pixel_id", label: "TikTok Pixel ID", type: "text" },
      { k: "clarity_id", label: "Microsoft Clarity ID", type: "text" },
    ],
  },
  {
    id: "legal", group: "Settings", key: "legal", title: "Legal pages", icon: "file", view: "/legal/privacy",
    type: "group",
    fields: ["privacy|Privacy policy", "terms|Terms of service", "refunds|Refund policy", "cookies|Cookie policy"].map((s) => {
      const [k, label] = s.split("|");
      return {
        k, label, type: "group",
        fields: [
          { k: "title", label: "Title", type: "text", half: true },
          { k: "updated", label: "Last updated", type: "text", half: true },
          { k: "description", label: "Summary (for Google)", type: "text" },
          { k: "body", label: "Content", type: "html" },
        ],
      };
    }),
  },
];
