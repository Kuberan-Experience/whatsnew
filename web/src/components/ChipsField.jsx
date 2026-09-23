import { useId, useState } from "react";

/**
 * Generic multi-value chip input backed by a datalist of suggestions, but
 * still accepting free text — the option list is a convenience, not a
 * whitelist.
 */
export default function ChipsField({
  value = [],
  options = [],
  onChange,
  disabled,
  placeholder = "Add…",
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw) {
    const label = String(raw ?? "").trim();
    if (!label) return;
    if (!value.some((v) => v.toLowerCase() === label.toLowerCase())) {
      onChange([...value, label]);
    }
    setDraft("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    }
    if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <>
      <div className={`paths__box ${disabled ? "is-disabled" : ""}`}>
        {value.map((label) => (
          <span key={label} className="chip">
            {label}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== label))}
                aria-label={`Remove ${label}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            className="paths__input"
            list={listId}
            value={draft}
            placeholder={value.length ? "Add another…" : placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => draft && add(draft)}
          />
        )}
      </div>
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
