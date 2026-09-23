/**
 * Seed data for the UI-only build. Shapes match the API contract the backend
 * will expose, so swapping the mock store for real fetch calls is a one-file
 * change in src/lib/store.js.
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

/**
 * Addressable fields and components in the app.
 *
 * This is the join between a release note and the actual UI: a PR that adds a
 * field names its `componentKey` here, and the screen renders a "New" badge on
 * exactly that control once the note has been sent — to the agents allowed to
 * see it. Without this, a release note is just prose that claims something
 * shipped; with it, the claim points at the control.
 */
export const PROFILE_COMPONENTS = [
  {
    key: "profile.publishName",
    label: "Publish Name",
    path: "Account Center > Profile",
  },
  { key: "profile.price", label: "Price", path: "Account Center > Profile" },
  {
    key: "profile.tagline",
    label: "Tagline",
    path: "Account Center > Profile",
  },
  { key: "profile.logo", label: "Logo", path: "Account Center > Profile" },
  {
    key: "profile.vertical",
    label: "Vertical",
    path: "Account Center > Profile",
  },
  {
    key: "profile.category",
    label: "Category",
    path: "Account Center > Profile",
  },
  {
    key: "profile.productsServices",
    label: "Products and Services",
    path: "Account Center > Profile",
  },
  {
    key: "profile.additionalCategories",
    label: "Additional Categories",
    path: "Account Center > Profile",
  },
  {
    key: "profile.profileUrl",
    label: "Your Profile URL",
    path: "Account Center > Profile",
  },
  {
    key: "profile.menuItems",
    label: "Menu Items",
    path: "Account Center > Profile > Menu Items",
  },
];

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
  logo: null,
  vertical: "Food & Beverages",
  category: "American Restaurant",
  productsServices: ["Dine-in", "Delivery", "Breakfast", "All-day menu"],
  additionalCategories: [
    { id: "ac_1", category: "Anago Restaurant", services: ["Online Ordering"] },
  ],
  profileUrl: "kps-restaurant-1233-18sep-158451",
};

// Password for every seeded account in this UI-only build.
export const DEMO_PASSWORD = "whatsnew123";

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
    email: "nivedth@experience.com",
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
