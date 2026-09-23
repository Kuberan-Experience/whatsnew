import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/store.js";
import { useAuth } from "../lib/auth.jsx";
import { CATEGORY_OPTIONS, SERVICE_OPTIONS } from "../mock/data.js";
import ChipsField from "../components/ChipsField.jsx";
import NewBadge from "../components/NewBadge.jsx";

const PRICES = [
  { value: "$", hint: "Under $10" },
  { value: "$$", hint: "$10–25" },
  { value: "$$$", hint: "$25–50" },
  { value: "$$$$", hint: "Over $50" },
];

const URL_PREFIX = "https://qa.experience.com/reviews/restaurant/";
const TABS = ["Quick Actions", "Reviews", "Rating", "About"];

export default function Profile() {
  const { user } = useAuth();
  const [mode, setMode] = useState("preview");
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [highlights, setHighlights] = useState({});
  const [status, setStatus] = useState({ busy: false, error: null, flash: null });

  useEffect(() => {
    api.getProfile().then((p) => {
      setSaved(p);
      setForm(p);
    });
    api.listHighlights(user.id).then(setHighlights);
  }, [user.id]);

  const dirty = useMemo(
    () => form && saved && JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved]
  );

  if (!form) return <p className="feed__empty">Loading…</p>;

  const newCount = Object.keys(highlights).filter((k) => k.startsWith("profile.")).length;

  return mode === "preview" ? (
    <ProfilePreview
      profile={saved}
      newCount={newCount}
      onEdit={() => {
        setForm(saved);
        setStatus({ busy: false, error: null, flash: null });
        setMode("edit");
      }}
    />
  ) : (
    <ProfileEditor
      form={form}
      setForm={setForm}
      highlights={highlights}
      dirty={dirty}
      status={status}
      onCancel={() => {
        setForm(saved);
        setMode("preview");
      }}
      onSave={async () => {
        setStatus({ busy: true, error: null, flash: null });
        try {
          const next = await api.saveProfile(form);
          setSaved(next);
          setForm(next);
          setStatus({ busy: false, error: null, flash: null });
          setMode("preview");
        } catch (err) {
          setStatus({ busy: false, error: err.message, flash: null });
        }
      }}
    />
  );
}

/* ------------------------------------------------------------------ preview */

function ProfilePreview({ profile, newCount, onEdit }) {
  const categories = [
    profile.category,
    ...profile.additionalCategories.map((r) => r.category),
  ].filter(Boolean);

  return (
    <div className="pv">
      <div className="pv__main">
        <div className="pv__visit">
          <span>
            Visit location profile –{" "}
            <a href={URL_PREFIX + profile.profileUrl} target="_blank" rel="noreferrer">
              {(URL_PREFIX + profile.profileUrl).slice(0, 52)}…
            </a>
          </span>
          <div className="pv__visitActions">
            <button type="button" className="btn btn--ghost">
              ‹ Back
            </button>
            <button type="button" className="btn btn--primary">
              Publish
            </button>
          </div>
        </div>

        <div className="pv__card">
          <div className="pv__banner" />

          <div className="pv__identity">
            <div className="pv__avatar">{profile.publishName.charAt(0) || "?"}</div>
            <div className="pv__head">
              <h1>
                {profile.publishName} <span className="pv__pro">PRO</span>
              </h1>
              <p className="pv__meta">
                {profile.category} · Ontario, CA
              </p>
              {profile.tagline && <p className="pv__tagline">{profile.tagline}</p>}
              <div className="pv__rating">
                <span className="pv__score">0</span>
                <span className="pv__stars" aria-label="0 out of 5 stars">
                  ★★★★★
                </span>
                <span className="pv__count">(0)</span>
              </div>
            </div>
          </div>

          <div className="pv__footer">
            <div className="pv__cats">
              {categories.map((c) => (
                <span key={c} className="pv__cat">
                  {c}
                </span>
              ))}
            </div>
            <div className="pv__actions">
              {newCount > 0 && (
                <span className="pv__newHint">
                  {newCount} new {newCount === 1 ? "field" : "fields"} in Edit
                </span>
              )}
              <button type="button" className="btn btn--primary" onClick={onEdit}>
                ✎ Edit
              </button>
              <button type="button" className="pv__share" aria-label="Share">
                ↗
              </button>
            </div>
          </div>
        </div>

        <div className="pv__card pv__card--tabs">
          {TABS.map((t, i) => (
            <button key={t} type="button" className={`pv__tab ${i === 0 ? "is-active" : ""}`}>
              {t}
              {i === 0 && <span className="pv__tabCount">10</span>}
            </button>
          ))}
        </div>

        <div className="pv__card pv__card--pad">
          <h2>Complete your profile</h2>
          <p>
            Complete your profile and help visitors find the most up-to-date information
            about your business and earn points toward your Search Rank Score.
          </p>
        </div>
      </div>

      <aside className="pv__rail">
        <div className="pv__card pv__card--pad">
          <h2>Recommended Dishes</h2>
          <p>The menu items marked as recommended will appear here.</p>
          <div className="pv__dish" aria-hidden="true">
            🌯
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------- editor */

function ProfileEditor({ form, setForm, highlights, dirty, status, onCancel, onSave }) {
  const set = (patch) => setForm({ ...form, ...patch });

  const updateRow = (id, patch) =>
    set({
      additionalCategories: form.additionalCategories.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    });

  return (
    <div className="profile">
      <div className="profile__bar">
        <h1>Edit Profile</h1>
        <div className="profile__barActions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dirty || status.busy}
            onClick={onSave}
          >
            {status.busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="profile__card">
        <div className="profile__banner">
          <button type="button" className="profile__camera" aria-label="Change cover photo">
            ⌖
          </button>
        </div>

        <div className="profile__identity">
          <div className="profile__avatar">
            {form.publishName.charAt(0) || "?"}
            <button
              type="button"
              className="profile__camera profile__camera--sm"
              aria-label="Change logo"
            >
              ⌖
            </button>
          </div>

          <div className="profile__name">
            <span className="field__label">
              Publish Name <b className="req">•</b>
              <NewBadge highlight={highlights["profile.publishName"]} />
            </span>
            <input
              value={form.publishName}
              onChange={(e) => set({ publishName: e.target.value })}
            />
          </div>
        </div>

        <section className="profile__section">
          <span className="field__label">
            Price <NewBadge highlight={highlights["profile.price"]} />
          </span>
          <div className="segmented">
            {PRICES.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`segmented__btn ${form.price === p.value ? "is-active" : ""}`}
                onClick={() => set({ price: p.value })}
              >
                <strong>{p.value}</strong>
                <span>{p.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="profile__grid">
          <div className="field">
            <span className="field__label">
              Tagline <NewBadge highlight={highlights["profile.tagline"]} />
            </span>
            <input
              value={form.tagline}
              placeholder="Enter Tagline"
              onChange={(e) => set({ tagline: e.target.value })}
            />
          </div>

          <div className="field">
            <span className="field__label">
              Logo <NewBadge highlight={highlights["profile.logo"]} />
            </span>
            <div className="upload">
              <p className="upload__cta">
                <span>Click to upload</span> or drag and drop
              </p>
              <p className="upload__rule">Allowed formats are JPEG, GIF, PNG, BMP and SVG</p>
              <p className="upload__rule">Image dimensions must be minimum of 200 × 50 px</p>
              <p className="upload__rule">Size should be within 10 KB to 10 MB</p>
            </div>
          </div>
        </section>

        <section className="profile__section">
          <span className="field__label">
            Vertical <NewBadge highlight={highlights["profile.vertical"]} />
          </span>
          {/* Set during onboarding and not editable here — same as the real app. */}
          <input value={form.vertical} disabled />
        </section>

        <section className="profile__section">
          <span className="field__label">
            Choose a category that applies to your business
            <NewBadge highlight={highlights["profile.category"]} />
          </span>
          <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </section>

        <section className="profile__section">
          <span className="field__label">
            Products and Services <b className="req">•</b>
            <NewBadge highlight={highlights["profile.productsServices"]} />
          </span>
          <ChipsField
            value={form.productsServices}
            options={SERVICE_OPTIONS}
            onChange={(productsServices) => set({ productsServices })}
            placeholder="Dine-in"
          />
        </section>

        <section className="profile__section">
          <span className="field__label">
            Additional Categories
            <NewBadge highlight={highlights["profile.additionalCategories"]} />
          </span>

          <div className="addl">
            {form.additionalCategories.map((row) => (
              <div key={row.id} className="addl__row">
                <div className="field">
                  <span className="addl__label">Category</span>
                  <select
                    value={row.category}
                    onChange={(e) => updateRow(row.id, { category: e.target.value })}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <span className="addl__link" aria-hidden="true">
                  ⛓
                </span>

                <div className="field">
                  <span className="addl__label">Products &amp; Services</span>
                  <ChipsField
                    value={row.services}
                    options={SERVICE_OPTIONS}
                    onChange={(services) => updateRow(row.id, { services })}
                  />
                </div>

                <button
                  type="button"
                  className="addl__delete"
                  aria-label="Remove category"
                  onClick={() =>
                    set({
                      additionalCategories: form.additionalCategories.filter(
                        (r) => r.id !== row.id
                      ),
                    })
                  }
                >
                  🗑
                </button>
              </div>
            ))}

            <button
              type="button"
              className="addl__add"
              onClick={() =>
                set({
                  additionalCategories: [
                    ...form.additionalCategories,
                    { id: `ac_${Date.now()}`, category: CATEGORY_OPTIONS[0], services: [] },
                  ],
                })
              }
            >
              ⊕ Add Categories
            </button>
          </div>
        </section>

        <section className="profile__section">
          <span className="field__label">
            Your Profile URL <b className="req">•</b>
            <NewBadge highlight={highlights["profile.profileUrl"]} />
          </span>
          <div className="urlRow">
            <input value={URL_PREFIX} disabled />
            <input value={form.profileUrl} onChange={(e) => set({ profileUrl: e.target.value })} />
          </div>
        </section>

        {status.error && <p className="alert alert--error">{status.error}</p>}
      </div>
    </div>
  );
}
