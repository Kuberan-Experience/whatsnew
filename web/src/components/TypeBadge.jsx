const TYPES = {
  new_field: { label: "New field", className: "badge badge--field" },
  new_component: { label: "New component", className: "badge badge--component" },
  update: { label: "Update", className: "badge badge--update" },
  bug_fix: { label: "Bug fix", className: "badge badge--fix" },
};

export const TYPE_OPTIONS = Object.entries(TYPES).map(([value, { label }]) => ({
  value,
  label,
}));

export default function TypeBadge({ type }) {
  const t = TYPES[type] ?? TYPES.update;
  return <span className={t.className}>{t.label}</span>;
}
