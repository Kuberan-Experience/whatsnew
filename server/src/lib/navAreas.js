/**
 * The app's nav tree, mirrored from the product shell (left sidebar).
 *
 * Two jobs:
 *  1. Seeds the path autocomplete in the admin dashboard, so admins pick real
 *     nav paths instead of inventing strings the permission matcher can't match.
 *  2. Documents the shape permissions are written in. Because matching is
 *     segment-wise prefix matching, granting "Account Center" grants every
 *     leaf beneath it; granting "Account Center > Billing" grants only that.
 *
 * Keep in sync with the sidebar. A path that appears in a PR but not here is
 * still accepted — this list is a convenience, not a whitelist.
 */
export const NAV_TREE = [
  {
    group: "Command Center",
    items: [
      { label: "Search Ranking", children: ["Keywords", "Competitors", "Local Listings"] },
      { label: "Social Posts", children: [] },
      { label: "Insights", children: ["Reviews", "Sentiment", "Benchmarks"] },
      { label: "Network", children: ["Connections", "Referrals"] },
    ],
  },
  {
    group: "Account Center",
    items: [
      { label: "Profile", children: ["Hierarchy", "Preview Profile", "Menu Items"] },
      { label: "Connections", children: [] },
      { label: "Settings", children: ["Notifications", "Team", "Integrations"] },
      { label: "Billing", children: ["Plan", "Invoices"] },
    ],
  },
  {
    group: "Home",
    items: [{ label: "Onboarding", children: [] }],
  },
];

/** Flattened "A > B > C" labels, every level, for autocomplete + seeding. */
export function flattenNavPaths() {
  const out = [];
  for (const { group, items } of NAV_TREE) {
    out.push(group);
    for (const item of items) {
      out.push(`${group} > ${item.label}`);
      for (const child of item.children) {
        out.push(`${group} > ${item.label} > ${child}`);
      }
    }
  }
  return out;
}
