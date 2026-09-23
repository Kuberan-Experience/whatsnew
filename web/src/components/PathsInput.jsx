import { useEffect, useId, useState } from "react";
import { api } from "../lib/store.js";
import { normalizePathLabel } from "../lib/permissions.js";

/**
 * Multi-value input for nav paths ("Account Center > Billing > Invoices").
 *
 * Backed by a datalist of real nav paths so admins pick paths the permission
 * matcher can actually match, while still allowing free text — a PR can land
 * before the nav list here is updated, and blocking that would be worse than
 * allowing an unrecognised path.
 */
export default function PathsInput({ value, onChange, disabled }) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const listId = useId();

  useEffect(() => {
    api.navPaths().then(setSuggestions);
  }, []);

  function add(raw) {
    const label = normalizePathLabel(raw);
    if (!label) return;
    const exists = value.some((v) => v.toLowerCase() === label.toLowerCase());
    if (!exists) onChange([...value, label]);
    setDraft("");
  }

  function remove(label) {
    onChange(value.filter((v) => v !== label));
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    }
    // Backspace on an empty field removes the last chip — the behaviour every
    // tag input has, and people expect it.
    if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const unknown = value.filter((v) => !suggestions.includes(v));

  return (
    <div className="paths">
      <div className={`paths__box ${disabled ? "is-disabled" : ""}`}>
        {value.map((label) => (
          <span key={label} className="chip">
            {label}
            {!disabled && (
              <button type="button" onClick={() => remove(label)} aria-label={`Remove ${label}`}>
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
            placeholder={value.length ? "Add another…" : "Account Center > Billing"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => draft && add(draft)}
          />
        )}
      </div>

      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {value.length === 0 && (
        <p className="hint">
          No paths — this note is treated as app-wide and goes to every agent.
        </p>
      )}
      {unknown.length > 0 && (
        <p className="hint hint--warn">
          Not in the nav list: {unknown.join(", ")}. Agents will only match it if their
          permissions use the same wording.
        </p>
      )}
    </div>
  );
}
