/**
 * The app's own content and structure — not fabricated release-note data.
 *
 *  - NAV_TREE      the sidebar the agent actually sees, and the vocabulary
 *                  permissions are written in ("Account Center > Profile").
 *  - PROFILE_SEED  the business profile an agent edits.
 *  - USERS         who can sign in.
 *
 * Release notes are not here. Every one of them comes from a real pull request.
 */

export const NAV_TREE = [
  {
    group: "Command Center",
    items: [
      {
        label: "Search Ranking",
        children: ["Keywords", "Competitors", "Local Listings"],
      },
      { label: "Social Posts", children: [] },
      { label: "Insights", children: ["Reviews", "Sentiment", "Benchmarks"] },
      { label: "Network", children: ["Connections", "Referrals"] },
    ],
  },
  {
    group: "Account Center",
    items: [
      {
        label: "Profile",
        children: ["Hierarchy", "Preview Profile", "Menu Items"],
      },
      { label: "Connections", children: [] },
      {
        label: "Settings",
        children: ["Notifications", "Team", "Integrations"],
      },
      { label: "Billing", children: ["Plan", "Invoices"] },
    ],
  },
];

/** Every nav path, all levels — powers the path picker's autocomplete. */
export function flattenNavPaths() {
  const out = [];
  for (const { group, items } of NAV_TREE) {
    out.push(group);
    for (const item of items) {
      out.push(`${group} > ${item.label}`);
      for (const child of item.children)
        out.push(`${group} > ${item.label} > ${child}`);
    }
  }
  return out;
}

export const CATEGORY_OPTIONS = [
  "American Restaurant",
  "Anago Restaurant",
  "Bakery",
  "Cafe",
  "Fine Dining",
  "Food Truck",
];

export const SERVICE_OPTIONS = [
  "Dine-in",
  "Delivery",
  "Takeout",
  "Breakfast",
  "All-day menu",
  "Online Ordering",
  "Catering",
  "Outdoor seating",
];

/** The profile an agent edits. Persisted to localStorage on save. */
export const PROFILE_SEED = {
  publishName: "KPS Restaurant 18Sep",
  price: "$$",
  tagline: "",
  personalWebsite: "",
  logo: null,
  vertical: "Food & Beverages",
  category: "American Restaurant",
  productsServices: ["Dine-in", "Delivery", "Breakfast", "All-day menu"],
  additionalCategories: [
    { id: "ac_1", category: "Anago Restaurant", services: ["Online Ordering"] },
  ],
  profileUrl: "kps-restaurant-1233-18sep-158451",
};

// Passwords are not stored here. Sign-in is verified server-side against
// APP_PASSWORD; see server/auth.mjs.

export const USERS = [
  {
    id: "u_kuberan",
    email: "kuberan@experience.com",
    name: "Kuberan Venkatesh",
    role: "admin",
    permissions: ["*"],
  },
  {
    id: "u_kuberan_personal",
    email: "kuberanvenkatesh3@gmail.com",
    name: "Kuberan Venkatesh",
    role: "agent",
    permissions: ["*"],
  },
  {
    id: "u_nivedth",
    email: "kuberan@experience.com",
    name: "Nivedth",
    role: "agent",
    // Scoped to Account Center, so Command Center releases (Insights, Search
    // Ranking) skip this account — that is what keeps the permission filter
    // visible in the demo.
    permissions: ["Account Center > Profile", "Account Center > Billing"],
  },
];

/**
 * No seeded release notes. Every note in this app comes from a real GitHub pull
 * request imported through the admin dashboard, so there is nothing to invent
 * here — an empty dashboard is the honest starting state.
 */
export const RELEASE_NOTES = [];

export const NOTIFICATIONS = [];
