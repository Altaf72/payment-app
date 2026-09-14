import { Fragment, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
const DEALS = {
  rental: "Rental",
  primary_offplan: "Primary (off-plan)",
  buy_sell: "Buy & sell",
};
const LEADS = {
  dubizzle: "Dubizzle",
  property_finder: "Property Finder",
  bayut: "Bayut",
  social_media: "Social media",
  reference: "Reference",
  other: "Other",
};
const STATUSES = [
  "Pending Documents",
  "Invoice Sent to Developer",
  "Commission Received",
  "Payment to Agents Pending",
  "Paid to Agents",
  "Completed",
  "On Hold",
  "Cancelled",
];
const MODES = ["Cash", "Bank", "Cheque"],
  UNITS = [
    "Studio",
    "1BR",
    "2BR",
    "3BR",
    "4BR",
    "Penthouse",
    "Villa",
    "Townhouse",
    "Other",
  ];
const DEFAULT_DOCS = {
  primary_offplan: [
    ["booking_doc", "Initial sale contract / booking document"],
    ["eid", "Buyer + seller Emirates ID"],
    ["passport", "Buyer + seller passport"],
    ["kyc", "KYC"],
  ],
  buy_sell: [
    ["title_deed", "Title deed / initial contract"],
    ["contract_f", "Contract F (MOU)"],
    ["eid", "Buyer + seller Emirates ID"],
    ["passport", "Buyer + seller passport"],
  ],
  rental: [
    ["title_deed", "Title deed"],
    ["tenancy_contract", "Tenancy contract"],
    ["eid", "Client Emirates ID"],
    ["passport", "Client passport"],
  ],
};
const TOP = [
  ["team_leader_incentive", "Team Leader Incentive"],
  ["kickback_agent", "Kickback to Agent"],
  ["kickback_client", "Kickback to Client"],
];
const KICKBACK_KINDS = ["kickback_agent", "kickback_client"];
const isKickback = (kind) => KICKBACK_KINDS.includes(kind);
const DIST_TYPE_OPTIONS = [
  ["kickback_agent", "Kickback"],
  ["residual", "Commission"],
];
const distTypeLabel = (kind) => (isKickback(kind) ? "Kickback" : "Commission");
const GOOGLE_CLIENT_ID =
  "70086088232-f0c97ls3nljbber210frbugmdam03bo0.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_ROOT_FOLDER_NAME = "Commission Sheets Attachments";
const loadGoogleIdentity = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector("script[data-gis]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Identity Services")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.gis = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
const today = () => /* @__PURE__ */ new Date().toISOString().slice(0, 10),
  id = () => crypto.randomUUID();
const shiftDate = (value, days) => {
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
};
const buildDiskName = (code, fileName, index, total) => {
  const safeCode = code.replaceAll(".", "_");
  return total > 1
    ? `${safeCode}__${index + 1}of${total}__${fileName}`
    : `${safeCode}__${fileName}`;
};
const num = (value) => Number(String(value ?? "").replaceAll(",", "")) || 0,
  round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100,
  roundPct = (value) =>
    Math.round((Number(value) + Number.EPSILON) * 1e6) / 1e6;
const recalcDistribution = (distribution, grossAmount) => {
  const gross = num(grossAmount);
  let splitIndex = 0;
  while (
    splitIndex < distribution.length &&
    isKickback(distribution[splitIndex].line_kind)
  )
    splitIndex++;
  // 5a: every row is calculated in parallel against the total commission —
  // rows don't cascade against each other.
  const topAmounts = distribution
    .slice(0, splitIndex)
    .map((item) => round((gross * num(item.pct_of_base)) / 100));
  const kickbackTotal = topAmounts.reduce((sum, amount) => sum + amount, 0),
    remaining = round(Math.max(gross - kickbackTotal, 0));
  // 5b: every row is calculated in parallel against what's left after 5a —
  // rows don't cascade against each other either.
  return distribution.map((item, index) => {
    const isTop = index < splitIndex,
      base = isTop ? gross : remaining,
      amount = isTop
        ? topAmounts[index]
        : round((remaining * num(item.pct_of_base)) / 100);
    return {
      ...item,
      base_aed: base,
      payable_aed: amount,
      remaining_after: remaining,
    };
  });
};
const fmt = (value) =>
    num(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  money = (value) => `AED ${fmt(value)}`;
const dateText = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
        .format(/* @__PURE__ */ new Date(`${value}T00:00:00`))
        .replaceAll(" ", "-")
    : "\u2014";
const preference = (key) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const payment = () => ({
  id: id(),
  payment_date: today(),
  amount_aed: "",
  payment_mode: "",
  instrument_no: "",
  notes: "",
});
const receipt = () => ({
  id: id(),
  received_date: today(),
  amount_aed: "",
  receive_mode: "",
  instrument_no: "",
  remarks: "",
});
const line = (
  line_kind = "residual",
  type_label = "Residual Allocation",
  party = "Agent",
) => ({
  id: id(),
  line_kind,
  type_label,
  party,
  recipient_name: "",
  pct_of_base: "",
  payable_aed: "",
  notes: "",
  payments: [],
  auto_balance: false,
});
const empty = () => ({
  id: null,
  form_ref: "",
  company_id: "",
  transaction_date: today(),
  client_name: "",
  client_contact: "",
  client_id_number: "",
  client_id_expiry: "",
  building_project: "",
  developer: "",
  developer_bdm_name: "",
  developer_bdm_email: "",
  developer_bdm_contact: "",
  unit_no: "",
  unit_type: "",
  bedrooms: "",
  unit_value_aed: "",
  agent_name: "",
  agent_team: "",
  deal_type: "",
  lead_source: "",
  lead_source_other: "",
  commission_pct: "",
  gross_commission_aed: "",
  tracking_status: "",
  invoice_no: "",
  invoice_sent_date: "",
  commission_paid_date: "",
  payment_mode_paid: "",
  paid_client_ext_date: "",
  paid_client_ext_amount: "",
  deductions_aed: "",
  additional_payment_aed: "",
  finance_amount_paid_override_aed: "",
  finance_override_reason: "",
  remarks: "",
  prepared_by: "",
  manager: "",
  accounts: "",
  distribution: [],
  documents: [],
  receipts: [],
});
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const openDb = () =>
  new Promise((resolve, reject) => {
    // Open the browser's current database version. Requesting a newer fixed
    // version can remain blocked forever while another tab still owns v1.
    const request = indexedDB.open("payment-app-commission");
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("settings"))
        request.result.createObjectStore("settings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(
          "Local settings database is busy in another tab. Close the other tab and retry.",
        ),
      );
  });
async function setting(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("settings").objectStore("settings").get(key);
    request.onsuccess = () => {
      const value = request.result || null;
      db.close();
      resolve(value);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
async function saveSetting(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
function Amount({
  value,
  onChange,
  onBlur,
  readOnly = false,
  required = false,
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      className="form-control cis-number"
      inputMode="decimal"
      required={required}
      readOnly={readOnly}
      value={
        value === ""
          ? ""
          : focus
            ? String(value).replaceAll(",", "")
            : fmt(value)
      }
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        onBlur?.();
      }}
      onKeyDown={(e) => {
        if (["ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
      }}
      onChange={(e) => onChange?.(e.target.value.replace(/[^0-9.-]/g, ""))}
    />
  );
}
function DateInput({ value, onChange, required = false }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const openPicker = () => {
    if (ref.current?.showPicker) ref.current.showPicker();
    else ref.current?.focus();
  };
  return (
    <div className="cis-date" style={{ position: "relative" }}>
      <input
        className="form-control"
        readOnly
        required={required}
        value={value ? dateText(value) : ""}
        placeholder="dd-MMM-yyyy"
        onClick={openPicker}
        style={focused ? { visibility: "hidden" } : undefined}
      />
      <button type="button" onClick={openPicker}>
        ▣
      </button>
      <input
        ref={ref}
        className="cis-native-date"
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            onChange(shiftDate(value, 1));
          } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            onChange(shiftDate(value, -1));
          }
        }}
        style={
          focused
            ? {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 1,
                zIndex: 2,
                background: "#fff",
                border: "2px solid #2563eb",
                borderRadius: "4px",
                padding: "0 8px",
                fontSize: "13px",
                lineHeight: "normal",
                color: "#111",
              }
            : undefined
        }
      />
    </div>
  );
}
function GoogleDriveConnectPrompt({ onConnect, onDismiss }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "24px 28px",
          maxWidth: 440,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Google Drive needs to be connected</h3>
        <p className="form-hint">
          Attachments are saved to your Google Drive. Connect your Google
          account to save or open attachments — this stays connected for
          about an hour at a time, then you'll be asked again.
        </p>
        <div
          className="cis-inline-actions"
          style={{ marginTop: 16, display: "flex", gap: 8 }}
        >
          <button type="button" className="btn primary" onClick={onConnect}>
            Connect Google Drive
          </button>
          <button type="button" className="btn ghost" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>

    </div>
  );
}
function AttachmentViewerModal({
  viewer,
  onClose,
  onDownload,
  onPrint,
  onRemove,
}) {
  if (!viewer) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          width: "min(900px, 92vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <strong
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {viewer.name}
          </strong>
          <button type="button" className="btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 300,
            overflow: "auto",
            padding: viewer.url ? 0 : 24,
            display: "flex",
            alignItems: viewer.url ? "stretch" : "center",
            justifyContent: "center",
          }}
        >
          {viewer.loading && (
            <p className="form-hint">Loading attachment…</p>
          )}
          {viewer.error && (
            <p className="alert alert-error">{viewer.error}</p>
          )}
          {viewer.url &&
            !viewer.error &&
            (viewer.mimeType?.startsWith("image/") ? (
              <img
                src={viewer.url}
                alt={viewer.name}
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                  margin: "auto",
                  display: "block",
                }}
              />
            ) : (
              <iframe
                title={viewer.name}
                src={viewer.url}
                style={{ width: "100%", height: "80vh", border: "none" }}
              />
            ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            className="btn primary"
            disabled={!viewer.url}
            onClick={onDownload}
          >
            Download
          </button>
          <button
            type="button"
            className="btn"
            disabled={!viewer.url}
            onClick={onPrint}
          >
            Print
          </button>
          {viewer.canRemove && (
            <button
              type="button"
              className="btn danger"
              disabled={!viewer.fileId}
              onClick={onRemove}
              style={{ marginLeft: "auto" }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function Field({ label, required = false, hint, children }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}
function Section({ number, title, aside, children }) {
  return (
    <section className="card cis-section">
      <div className="card-header">
        <div className="cis-section-title">
          {number && <span>{number}</span>}
          <h2>{title}</h2>
        </div>
        {aside}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}
function CommissionChrome({
  active,
  form,
  compact,
  setCompact,
  wide,
  setWide,
  onEntry,
  onDashboard,
  onSetup,
  onDate,
  children,
}) {
  const toggle = (key, value, setter) => {
    setter(value);
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {}
  };
  return (
    <div
      className={`cis-page${compact ? " cis-compact" : ""}${wide ? " cis-wide" : ""}`}
    >
      <header className="cis-topbar">
        <div>
          <p>Million Homes Real Estate Broker LLC</p>
          <h1>Commission Sheet</h1>
        </div>
        <div className="cis-topbar-meta">
          <Field label="Form ref">
            <input
              className="form-control"
              readOnly
              value={form?.form_ref || ""}
            />
          </Field>
          <Field label="Date">
            <DateInput
              value={form?.transaction_date || today()}
              onChange={onDate || (() => {})}
            />
          </Field>
          <label className="cis-compact-toggle">
            <input
              type="checkbox"
              checked={compact}
              onChange={(event) =>
                toggle(
                  "commission_sheet_compact_view",
                  event.target.checked,
                  setCompact,
                )
              }
            />{" "}
            Compact view
          </label>
          <button
            type="button"
            className="cis-width-toggle"
            onClick={() =>
              toggle("commission_sheet_wide_layout", !wide, setWide)
            }
          >
            {wide ? "⤡ Standard width" : "⤢ Full width"}
          </button>
        </div>
      </header>
      <nav className="cis-tabbar">
        <div>
          <button
            type="button"
            className={active === "editor" ? "active" : ""}
            onClick={onEntry}
          >
            New Entry
          </button>
          <button
            type="button"
            className={active === "dashboard" ? "active" : ""}
            onClick={onDashboard}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={active === "setup" ? "active" : ""}
            onClick={onSetup}
          >
            Setup
          </button>
        </div>
      </nav>
      {children}
    </div>
  );
}
function List({ id: lid, values }) {
  return (
    <datalist id={lid}>
      {[...new Set(values.filter(Boolean))].map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}
function CommissionSheets() {
  const { user, profile, hasModuleRole } = useAuth(),
    canMake = hasModuleRole("commission_sheets", "make"),
    canFinance = hasModuleRole("commission_sheets", "finance"),
    isSuper = profile?.role === "superadmin";
  const [view, setView] = useState("editor"),
    [backTo, setBackTo] = useState("dashboard"),
    [form, setForm] = useState(empty);
  const [rows, setRows] = useState([]),
    [companies, setCompanies] = useState([]),
    [templates, setTemplates] = useState([]),
    [options, setOptions] = useState([]);
  const [files, setFiles] = useState({}),
    [driveToken, setDriveToken] = useState(null),
    [driveTokenExpiry, setDriveTokenExpiry] = useState(0),
    [driveEmail, setDriveEmail] = useState(""),
    [driveRootFolderId, setDriveRootFolderId] = useState(null),
    [driveConnectDismissed, setDriveConnectDismissed] = useState(false),
    [viewer, setViewer] = useState(null),
    [letterhead, setLetterhead] = useState(null);
  const tokenClientRef = useRef(null);
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [deal, setDeal] = useState(""),
    [deleted, setDeleted] = useState(false);
  const [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [compact, setCompact] = useState(() =>
      preference("commission_sheet_compact_view"),
    ),
    [wide, setWide] = useState(() =>
      preference("commission_sheet_wide_layout"),
    );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(() => !!user?.id);
  const [newDoc, setNewDoc] = useState({
      deal_type: "rental",
      document_label: "",
      is_required: false,
    }),
    [newOption, setNewOption] = useState({
      option_kind: "type",
      label: "",
    });
  const set = (key, value) =>
      setForm((current) => ({
        ...current,
        [key]: value,
      })),
    gross = num(form.gross_commission_aed),
    vat = round(gross * 0.05),
    total = round(gross + vat);
  useEffect(() => {
    if (form.id || form.prepared_by) return;
    const displayName =
      profile?.full_name ||
      profile?.display_name ||
      profile?.name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      "";
    if (displayName) set("prepared_by", displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, user, profile]);
  const paid = (line2) =>
      (line2.payments || []).reduce(
        (sum, item) => sum + num(item.amount_aed),
        0,
      ),
    allPaid = form.distribution.reduce((sum, item) => sum + paid(item), 0),
    received = form.receipts.reduce(
      (sum, item) => sum + num(item.amount_aed),
      0,
    );
  const distComputed = recalcDistribution(form.distribution, gross);
  const kickbackTotal = distComputed
    .filter((item) => isKickback(item.line_kind))
    .reduce((sum, item) => sum + num(item.payable_aed), 0);
  const retained = distComputed.length
    ? distComputed.at(-1).remaining_after
    : round(gross);
  const residual = retained;
  const expectedPayable = distComputed
    .filter((item) => item.party !== "Company Share")
    .reduce((sum, item) => sum + num(item.payable_aed), 0);
  const types = options
      .filter((item) => item.option_kind === "type" && item.active)
      .map((item) => item.label),
    parties = options
      .filter((item) => item.option_kind === "party" && item.active)
      .map((item) => item.label);
  const activeDocs = templates.filter(
    (item) => item.deal_type === form.deal_type && item.active,
  );
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, c, t, o] = await Promise.all([
        supabase
          .from("commission_sheets")
          .select(
            "*,commission_distribution_lines(*,commission_distribution_payments(*)),commission_sheet_documents(*),commission_receipts(*)",
          )
          .order("transaction_date", {
            ascending: false,
          }),
        supabase
          .from("companies")
          .select("id,name,prefix")
          .eq("active", true)
          .order("name"),
        supabase
          .from("commission_document_templates")
          .select("*")
          .order("deal_type")
          .order("sort_order"),
        supabase
          .from("commission_distribution_options")
          .select("*")
          .order("option_kind")
          .order("sort_order"),
      ]);
      if (s.error) throw s.error;
      setRows(s.data || []);
      setCompanies(c.data || []);
      setTemplates(t.data || []);
      setOptions(o.data || []);
      try {
        setLetterhead(await setting("letterhead"));
        setDriveRootFolderId(await setting("driveRootFolderId"));
      } catch (localError) {
        console.warn("Commission local settings are unavailable:", localError);
      }
    } catch (loadError) {
      setError(loadError?.message || "Could not load commission sheets.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user?.id) load();
  }, [user?.id]);
  useEffect(() => {
    loadGoogleIdentity().catch((driveLoadError) =>
      console.warn("Google Identity Services unavailable:", driveLoadError),
    );
  }, []);
  useEffect(() => {
    if (!form.deal_type) return;
    const source = activeDocs.length
      ? activeDocs
      : DEFAULT_DOCS[form.deal_type].map(
          ([document_code, document_label], sort_order) => ({
            document_code,
            document_label,
            sort_order,
            is_required: false,
          }),
        );
    setForm((current) => ({
      ...current,
      documents: source.map(
        (item) =>
          current.documents.find(
            (doc) => doc.document_code === item.document_code,
          ) || {
            document_code: item.document_code,
            document_label: item.document_label,
            is_required: item.is_required,
            is_selected: !!item.is_required,
            local_file_name: null,
            local_folder_label: null,
          },
      ),
    }));
  }, [form.deal_type, templates]);
  const setup = () => {
      setBackTo(view);
      setView("setup");
      setError("");
      setNotice("");
    },
    fresh = () => {
      setForm(empty());
      setFiles({});
      setView("editor");
      setError("");
      setNotice("");
    };
  function edit(row) {
    const next = empty();
    Object.assign(next, row, {
      distribution: (row.commission_distribution_lines || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter(
          (item) =>
            item.line_kind === "residual" || isKickback(item.line_kind),
        )
        .map((item) => ({
          ...item,
          payments: item.commission_distribution_payments || [],
        })),
      documents: row.commission_sheet_documents || [],
      receipts: row.commission_receipts || [],
    });
    setForm(next);
    setFiles({});
    setView("editor");
    setError("");
    setNotice("");
  }
  function client(name) {
    const recent = rows.find(
      (row) => row.client_name?.toLowerCase() === name.trim().toLowerCase(),
    );
    setForm((current) => ({
      ...current,
      client_name: name,
      ...(recent && {
        client_contact: recent.client_contact || "",
        client_id_number: recent.client_id_number || "",
        client_id_expiry: recent.client_id_expiry || "",
        building_project: recent.building_project || "",
        developer: recent.developer || "",
        developer_bdm_name: recent.developer_bdm_name || "",
        developer_bdm_email: recent.developer_bdm_email || "",
        developer_bdm_contact: recent.developer_bdm_contact || "",
        unit_type: recent.unit_type || "",
      }),
    }));
  }
  function matchClientBy(field, value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    const recent = rows.find(
      (row) => (row[field] || "").trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (!recent) return;
    setForm((current) => ({
      ...current,
      client_name: current.client_name || recent.client_name || "",
      client_contact: current.client_contact || recent.client_contact || "",
      client_id_number:
        current.client_id_number || recent.client_id_number || "",
      client_id_expiry:
        current.client_id_expiry || recent.client_id_expiry || "",
      building_project:
        current.building_project || recent.building_project || "",
      developer: current.developer || recent.developer || "",
      developer_bdm_name:
        current.developer_bdm_name || recent.developer_bdm_name || "",
      developer_bdm_email:
        current.developer_bdm_email || recent.developer_bdm_email || "",
      developer_bdm_contact:
        current.developer_bdm_contact || recent.developer_bdm_contact || "",
      unit_type: current.unit_type || recent.unit_type || "",
    }));
  }
  function selectDeveloperBdm(name) {
    setForm((current) => {
      const normalizedName = name.trim().toLowerCase();
      const matchingDeveloper = rows.filter(
        (row) =>
          row.developer_bdm_name?.trim().toLowerCase() === normalizedName &&
          (!current.developer ||
            row.developer?.trim().toLowerCase() ===
              current.developer.trim().toLowerCase()),
      );
      const recent =
        matchingDeveloper.find(
          (row) =>
            current.building_project &&
            row.building_project?.trim().toLowerCase() ===
              current.building_project.trim().toLowerCase(),
        ) || matchingDeveloper[0];
      return {
        ...current,
        developer_bdm_name: name,
        ...(recent && {
          developer_bdm_email: recent.developer_bdm_email || "",
          developer_bdm_contact: recent.developer_bdm_contact || "",
        }),
      };
    });
  }
  function updateLine(index, key, value) {
    setForm((current) => {
      const gross2 = num(current.gross_commission_aed),
        beforeEdit = recalcDistribution(current.distribution, gross2),
        edited = current.distribution.map((item, i) => {
          if (i !== index) return item;
          const next =
            key === "payable_aed"
              ? {
                  ...item,
                  pct_of_base: beforeEdit[index]?.base_aed
                    ? roundPct(
                        (num(value) / beforeEdit[index].base_aed) * 100,
                      )
                    : item.pct_of_base,
                }
              : key === "line_kind"
                ? {
                    ...item,
                    line_kind: value,
                    type_label: distTypeLabel(value),
                  }
                : { ...item, [key]: value };
          // Directly editing a row takes it out of "auto-balance" mode —
          // it's no longer a follower, it's a fixed value the user chose.
          if (
            (key === "pct_of_base" || key === "payable_aed") &&
            item.auto_balance
          )
            next.auto_balance = false;
          return next;
        });
      // Live-track: if the trailing row in the 5b group is still in
      // auto-balance mode (and it isn't the row just edited), keep it
      // equal to whatever % the rest of the group hasn't used yet — this
      // runs on every keystroke so it never goes stale as you keep editing
      // earlier rows.
      let splitIndex = 0;
      while (
        splitIndex < edited.length &&
        isKickback(edited[splitIndex].line_kind)
      )
        splitIndex++;
      const lastIndex = edited.length - 1;
      let working = edited;
      if (
        lastIndex >= splitIndex &&
        lastIndex !== index &&
        edited[lastIndex].auto_balance
      ) {
        const othersTotal = edited
          .slice(splitIndex, lastIndex)
          .reduce((sum, item) => sum + num(item.pct_of_base), 0);
        working = edited.map((item, i) =>
          i === lastIndex
            ? {
                ...item,
                pct_of_base: roundPct(Math.max(100 - othersTotal, 0)),
              }
            : item,
        );
      }
      return {
        ...current,
        distribution: recalcDistribution(working, gross2).map(
          ({ base_aed, remaining_after, ...rest }) => rest,
        ),
      };
    });
  }
  function finalizeAllocationLine(index) {
    // Once you finish editing the %/Amount of the LAST row in the 5b
    // (allocation) group (tab or click away) and nothing is already
    // tracking the leftover, add a new row that auto-follows whatever %
    // remains unallocated — it updates live as you keep editing other
    // rows, rather than freezing at the value it was created with.
    setForm((current) => {
      const gross2 = num(current.gross_commission_aed),
        working = current.distribution;
      let splitIndex = 0;
      while (
        splitIndex < working.length &&
        isKickback(working[splitIndex].line_kind)
      )
        splitIndex++;
      const isLastRow = index === working.length - 1,
        inAllocationGroup = index >= splitIndex;
      if (!isLastRow || !inAllocationGroup) return current;
      if (working[index]?.auto_balance) return current;
      const groupTotalPct = working
          .slice(splitIndex)
          .reduce((sum, item) => sum + num(item.pct_of_base), 0),
        remainder = roundPct(100 - groupTotalPct);
      if (remainder <= 0.01) return current;
      const finalDistribution = [
        ...working,
        {
          ...line("residual", "Commission", "Internal Agent"),
          pct_of_base: remainder,
          auto_balance: true,
        },
      ];
      return {
        ...current,
        distribution: recalcDistribution(finalDistribution, gross2).map(
          ({ base_aed, remaining_after, ...rest }) => rest,
        ),
      };
    });
  }
  function insertLine(atIndex, newLine) {
    setForm((current) => {
      const gross2 = num(current.gross_commission_aed),
        distribution = [...current.distribution];
      distribution.splice(atIndex, 0, newLine);
      return {
        ...current,
        distribution: recalcDistribution(distribution, gross2).map(
          ({ base_aed, remaining_after, ...rest }) => rest,
        ),
      };
    });
  }
  const addPay = (i) =>
    setForm((current) => ({
      ...current,
      distribution: current.distribution.map((item, x) =>
        x === i
          ? {
              ...item,
              payments: [...(item.payments || []), payment()],
            }
          : item,
      ),
    }));
  const updatePay = (i, j, key, value) =>
    setForm((current) => ({
      ...current,
      distribution: current.distribution.map((item, x) =>
        x === i
          ? {
              ...item,
              payments: item.payments.map((entry, y) =>
                y === j
                  ? {
                      ...entry,
                      [key]: value,
                    }
                  : entry,
              ),
            }
          : item,
      ),
    }));
  const removePay = (i, j) =>
    setForm((current) => ({
      ...current,
      distribution: current.distribution.map((item, x) =>
        x === i
          ? {
              ...item,
              payments: item.payments.filter((_, y) => y !== j),
            }
          : item,
      ),
    }));
  const addReceipt = () => set("receipts", [...form.receipts, receipt()]),
    updateReceipt = (i, key, value) =>
      set(
        "receipts",
        form.receipts.map((item, x) =>
          x === i
            ? {
                ...item,
                [key]: value,
              }
            : item,
        ),
      );
  function driveTokenValid() {
    return !!driveToken && Date.now() < driveTokenExpiry;
  }
  async function connectGoogleDrive() {
    try {
      await loadGoogleIdentity();
      if (!tokenClientRef.current) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient(
          {
            client_id: GOOGLE_CLIENT_ID,
            scope: DRIVE_SCOPE,
            callback: (response) => {
              if (response.error) {
                setError(`Google Drive connection failed: ${response.error}`);
                return;
              }
              setDriveToken(response.access_token);
              setDriveTokenExpiry(
                Date.now() + (Number(response.expires_in) || 3600) * 1000 -
                  60000,
              );
              setDriveConnectDismissed(false);
              setNotice("Google Drive connected.");
            },
          },
        );
      }
      tokenClientRef.current.requestAccessToken({
        prompt: driveToken ? "" : "consent",
      });
    } catch (e) {
      setError(e.message);
    }
  }
  async function driveFetch(url, options = {}) {
    if (!driveTokenValid())
      throw new Error(
        "Google Drive isn't connected. Click \"Connect Google Drive\" in Setup, then try again.",
      );
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${driveToken}`,
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Google Drive error (${response.status}): ${body.slice(0, 200) || response.statusText}`,
      );
    }
    return response;
  }
  async function findOrCreateFolder(name, parentId) {
    const safeName = name.replace(/'/g, "\\'"),
      query = [
        `name='${safeName}'`,
        "mimeType='application/vnd.google-apps.folder'",
        "trashed=false",
        parentId ? `'${parentId}' in parents` : "'root' in parents",
      ].join(" and "),
      listRes = await driveFetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`,
      ),
      listData = await listRes.json();
    if (listData.files?.length) return listData.files[0].id;
    const createRes = await driveFetch(
        "https://www.googleapis.com/drive/v3/files",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: parentId ? [parentId] : undefined,
          }),
        },
      ),
      created = await createRes.json();
    return created.id;
  }
  async function ensureRootFolder() {
    if (driveRootFolderId) return driveRootFolderId;
    const stored = await setting("driveRootFolderId");
    if (stored) {
      setDriveRootFolderId(stored);
      return stored;
    }
    const id = await findOrCreateFolder(DRIVE_ROOT_FOLDER_NAME);
    await saveSetting("driveRootFolderId", id);
    setDriveRootFolderId(id);
    return id;
  }
  async function ensureTransactionFolder(ref) {
    const rootId = await ensureRootFolder();
    return findOrCreateFolder(ref.replace(/[^a-z0-9_-]/gi, "_"), rootId);
  }
  async function uploadFileToDrive(folderId, diskName, file) {
    const metadata = { name: diskName, parents: [folderId] },
      body = new FormData();
    body.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    body.append("file", file);
    const res = await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      { method: "POST", body },
    );
    return res.json();
  }
  async function driveFindFile(folderId, diskName) {
    const query = [
        `name='${diskName.replace(/'/g, "\\'")}'`,
        `'${folderId}' in parents`,
        "trashed=false",
      ].join(" and "),
      res = await driveFetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,mimeType)&spaces=drive`,
      ),
      data = await res.json();
    return data.files?.[0] || null;
  }
  async function driveFetchBlob(fileId) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    );
    return res.blob();
  }
  async function driveTrashFile(fileId) {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }
  function previewLocalFile(file) {
    const url = URL.createObjectURL(file);
    setViewer({
      name: file.name,
      loading: false,
      error: "",
      url,
      fileId: null,
      mimeType: file.type,
      canRemove: false,
      onRemoved: null,
    });
  }
  async function openAttachment({
    folderId,
    diskName,
    displayName,
    canRemove = false,
    onRemoved,
  }) {
    setViewer({
      name: displayName,
      loading: true,
      error: "",
      url: "",
      fileId: null,
      mimeType: "",
      canRemove,
      onRemoved,
    });
    try {
      if (!driveTokenValid())
        throw new Error(
          "Connect Google Drive in Setup to view attachments.",
        );
      const found = await driveFindFile(folderId, diskName);
      if (!found)
        throw new Error(
          "File not found in Google Drive — it may have been removed there.",
        );
      const blob = await driveFetchBlob(found.id),
        url = URL.createObjectURL(blob);
      setViewer((current) =>
        current
          ? {
              ...current,
              loading: false,
              url,
              fileId: found.id,
              mimeType: found.mimeType || blob.type,
            }
          : current,
      );
    } catch (e) {
      setViewer((current) =>
        current ? { ...current, loading: false, error: e.message } : current,
      );
    }
  }
  function closeAttachment() {
    setViewer((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }
  function downloadAttachment() {
    if (!viewer?.url) return;
    const link = document.createElement("a");
    link.href = viewer.url;
    link.download = viewer.name || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  function printAttachment() {
    if (!viewer?.url) return;
    const win = window.open(viewer.url, "_blank");
    if (win)
      win.addEventListener("load", () => {
        try {
          win.focus();
          win.print();
        } catch {
          // best-effort — some browsers restrict scripted print on certain viewers
        }
      });
  }
  async function removeAttachment() {
    if (!viewer?.fileId) return;
    try {
      await driveTrashFile(viewer.fileId);
      viewer.onRemoved?.();
      setNotice("Attachment removed (recoverable from Google Drive Trash).");
      closeAttachment();
    } catch (e) {
      setError(e.message);
    }
  }
  async function chooseLetterhead(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const value = {
        name: file.name,
        dataUrl: reader.result,
      };
      await saveSetting("letterhead", value);
      setLetterhead(value);
      setNotice("Letterhead saved locally.");
    };
    reader.readAsDataURL(file);
  }
  async function copyFiles(ref) {
    const entries = Object.entries(files).filter(
      ([, fileList]) => fileList?.length,
    );
    if (!entries.length) return {};
    if (!driveTokenValid())
      throw new Error(
        "Connect Google Drive in Setup before saving selected attachments.",
      );
    const folderId = await ensureTransactionFolder(ref),
      result = {};
    for (const [code, fileList] of entries) {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i],
          diskName = buildDiskName(code, file.name, i, fileList.length);
        await uploadFileToDrive(folderId, diskName, file);
      }
      result[code] = {
        local_file_name: fileList.map((file) => file.name).join("|"),
        local_folder_label: folderId,
      };
    }
    return result;
  }
  async function shareTransaction(row) {
    try {
      const ref = row?.form_ref;
      if (!ref) return setError("Save the transaction before sharing.");
      if (!driveTokenValid()) {
        setError(
          "Connect Google Drive in Setup before sharing attachments.",
        );
        return;
      }
      const folderId = await ensureTransactionFolder(ref);
      await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "writer", type: "anyone" }),
        },
      );
      const link = `https://drive.google.com/drive/folders/${folderId}`;
      await navigator.clipboard.writeText(link);
      setNotice(
        "Link copied. Anyone with this link can view, add, and edit these files — only share it with people you trust.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  async function save(event) {
    event.preventDefault();
    setError("");
    const missing = [];
    if (!form.company_id) missing.push("Company");
    if (!form.client_name) missing.push("Client name");
    if (!form.unit_no) missing.push("Unit no");
    if (!form.deal_type) missing.push("Deal type");
    if (!gross) missing.push("Gross commission");
    if (missing.length)
      return setError(`Missing required: ${missing.join(", ")}.`);
    const attachments = form.documents.filter(
      (doc) =>
        doc.is_selected &&
        !files[doc.document_code]?.length &&
        !doc.local_file_name,
    );
    if (attachments.length)
      return setError(
        `Attachment required for: ${attachments.map((doc) => doc.document_label).join(", ")}.`,
      );
    let splitIndex = 0;
    while (
      splitIndex < form.distribution.length &&
      isKickback(form.distribution[splitIndex].line_kind)
    )
      splitIndex++;
    const kickbackPctTotal = form.distribution
        .slice(0, splitIndex)
        .reduce((sum, item) => sum + num(item.pct_of_base), 0),
      allocationPctTotal = form.distribution
        .slice(splitIndex)
        .reduce((sum, item) => sum + num(item.pct_of_base), 0);
    if (kickbackPctTotal > 100.01)
      return setError(
        `5a. Kickback percentages add up to ${fmt(kickbackPctTotal)}% of total commission — that's over 100%. Please correct before saving.`,
      );
    if (allocationPctTotal > 100.01)
      return setError(
        `5b. Remaining commission allocation percentages add up to ${fmt(allocationPctTotal)}% — that's over 100%. Please correct before saving.`,
      );
    if (
      form.finance_amount_paid_override_aed !== "" &&
      !form.finance_override_reason.trim()
    )
      return setError("Finance override reason is required.");
    setSaving(true);
    try {
      let ref = form.form_ref;
      if (!ref) {
        const result = await supabase.rpc("next_commission_sheet_ref", {
          p_company_id: form.company_id,
        });
        if (result.error) throw result.error;
        ref = result.data;
      }
      const copied = await copyFiles(ref),
        payload = {
          ...form,
          form_ref: ref,
          gross_commission_aed: gross,
          vat_amount_aed: vat,
          total_payable_aed: total,
          amount_received_aed: received,
          calculated_amount_paid_aed: allPaid,
          commission_received_date: form.receipts.at(-1)?.received_date || null,
          net_agent_payable_aed: round(
            received -
              num(form.deductions_aed) +
              num(form.additional_payment_aed),
          ),
          total_after_deduction_aed: round(
            gross - num(form.deductions_aed) + num(form.additional_payment_aed),
          ),
          updated_by: user.id,
        };
      [
        "distribution",
        "documents",
        "receipts",
        "commission_distribution_lines",
        "commission_sheet_documents",
        "commission_receipts",
        "id",
      ].forEach((key) => delete payload[key]);
      [
        "unit_value_aed",
        "commission_pct",
        "finance_amount_paid_override_aed",
        "paid_client_ext_amount",
      ].forEach((key) => {
        if (key in payload)
          payload[key] =
            payload[key] === "" || payload[key] == null
              ? null
              : num(payload[key]);
      });
      [
        "deductions_aed",
        "additional_payment_aed",
        "calculated_amount_paid_aed",
        "net_agent_payable_aed",
        "total_after_deduction_aed",
      ].forEach((key) => {
        if (key in payload) payload[key] = num(payload[key]);
      });
      [
        "client_id_expiry",
        "invoice_sent_date",
        "commission_received_date",
        "commission_paid_date",
        "paid_client_ext_date",
      ].forEach((key) => {
        if (key in payload) payload[key] = payload[key] || null;
      });
      if (!canFinance)
        [
          "tracking_status",
          "invoice_no",
          "invoice_sent_date",
          "amount_received_aed",
          "commission_received_date",
          "receive_mode",
          "commission_paid_date",
          "payment_mode_paid",
          "paid_client_ext_date",
          "paid_client_ext_amount",
          "deductions_aed",
          "additional_payment_aed",
          "finance_amount_paid_override_aed",
          "finance_override_reason",
          "remarks",
          "prepared_by",
          "manager",
          "accounts",
        ].forEach((key) => delete payload[key]);
      let sheetId = form.id;
      if (sheetId) {
        const result = await supabase
          .from("commission_sheets")
          .update(payload)
          .eq("id", sheetId);
        if (result.error) throw result.error;
      } else {
        const result = await supabase
          .from("commission_sheets")
          .insert({
            ...payload,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (result.error) throw result.error;
        sheetId = result.data.id;
      }
      await supabase
        .from("commission_distribution_lines")
        .delete()
        .eq("commission_sheet_id", sheetId);
      const finalDistribution = recalcDistribution(form.distribution, gross);
      for (let i = 0; i < form.distribution.length; i++) {
        const item = form.distribution[i],
          finalAmount = finalDistribution[i].payable_aed,
          lineId = id(),
          result = await supabase.from("commission_distribution_lines").insert({
            id: lineId,
            commission_sheet_id: sheetId,
            line_kind: item.line_kind,
            type_label: item.type_label || null,
            sort_order: i,
            party: item.party || null,
            recipient_name: item.recipient_name || null,
            pct_of_base: num(item.pct_of_base) || null,
            payable_aed: num(finalAmount),
            paid_aed: paid(item),
            payment_mode: item.payments.at(-1)?.payment_mode || null,
            notes: item.notes || null,
          });
        if (result.error) throw result.error;
        const payments = item.payments
          .filter((entry) => num(entry.amount_aed) > 0)
          .map((entry) => ({
            distribution_line_id: lineId,
            payment_date: entry.payment_date,
            amount_aed: num(entry.amount_aed),
            payment_mode: entry.payment_mode || null,
            instrument_no: entry.instrument_no || null,
            notes: entry.notes || null,
            created_by: user.id,
          }));
        if (payments.length) {
          const payResult = await supabase
            .from("commission_distribution_payments")
            .insert(payments);
          if (payResult.error) throw payResult.error;
        }
      }
      await supabase
        .from("commission_sheet_documents")
        .delete()
        .eq("commission_sheet_id", sheetId);
      const docs = form.documents.map((doc) => ({
        commission_sheet_id: sheetId,
        document_code: doc.document_code,
        document_label: doc.document_label,
        is_selected: !!doc.is_selected,
        local_file_name:
          copied[doc.document_code]?.local_file_name ||
          doc.local_file_name ||
          null,
        local_folder_label:
          copied[doc.document_code]?.local_folder_label ||
          doc.local_folder_label ||
          null,
      }));
      if (docs.length) {
        const result = await supabase
          .from("commission_sheet_documents")
          .insert(docs);
        if (result.error) throw result.error;
      }
      if (canFinance) {
        await supabase
          .from("commission_receipts")
          .delete()
          .eq("commission_sheet_id", sheetId);
        const receipts = form.receipts
          .filter((item) => num(item.amount_aed) > 0)
          .map((item) => ({
            commission_sheet_id: sheetId,
            received_date: item.received_date,
            amount_aed: num(item.amount_aed),
            receive_mode: item.receive_mode || null,
            instrument_no: item.instrument_no || null,
            remarks: item.remarks || null,
            created_by: user.id,
          }));
        if (receipts.length) {
          const result = await supabase
            .from("commission_receipts")
            .insert(receipts);
          if (result.error) throw result.error;
        }
      }
      await load();
      setView("dashboard");
      setNotice(`${ref} saved successfully.`);
    } catch (e) {
      setError(e.message || "Could not save the transaction.");
    } finally {
      setSaving(false);
    }
  }
  const softDelete = async (row) => {
    if (!isSuper || !confirm(`Move ${row.form_ref} to Recycle Bin?`)) return;
    await supabase
      .from("commission_sheets")
      .update({
        deleted_at: /* @__PURE__ */ new Date().toISOString(),
        deleted_by: user.id,
        updated_by: user.id,
      })
      .eq("id", row.id);
    load();
  };
  const restore = async (row) => {
    if (!isSuper) return;
    await supabase
      .from("commission_sheets")
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_by: user.id,
      })
      .eq("id", row.id);
    load();
  };
  const purge = async (row) => {
    if (
      !isSuper ||
      prompt("Type Permanently Delete to continue") !== "Permanently Delete"
    )
      return;
    await supabase.from("commission_sheets").delete().eq("id", row.id);
    load();
  };
  function print(row) {
    const company =
        companies.find((item) => item.id === row.company_id)?.name || "—",
      allLines = (row.commission_distribution_lines || row.distribution || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      lineComputed = recalcDistribution(allLines, row.gross_commission_aed),
      documents = row.commission_sheet_documents || row.documents || [],
      receipts = row.commission_receipts || row.receipts || [];
    const kickbackTotal = lineComputed
        .filter((item) => isKickback(item.line_kind))
        .reduce((sum, item) => sum + num(item.payable_aed), 0),
      retainedAmt = lineComputed.length
        ? lineComputed.at(-1).remaining_after
        : num(row.gross_commission_aed);
    const checked = (value) => (value ? "☑" : "☐"),
      cell = (label, value) =>
        `<div class="ps-cell"><span class="l">${esc(label)}</span><span class="v">${value ?? "—"}</span></div>`;
    const docRows =
      documents
        .map((doc) => {
          const fileList = (doc.local_file_name || "")
            .split("|")
            .filter(Boolean)
            .join(", ");
          return `<div>${checked(doc.is_selected)} ${esc(doc.document_label)}${fileList ? ` — <em>${esc(fileList)}</em>` : ""}</div>`;
        })
        .join("") || "<div>—</div>";
    const docRowsWrapped = `<div class="ps-doc-list">${docRows}</div>`;
    const distRows =
      lineComputed
        .map((item) => {
          const itemPaid = item.paid_aed ?? paid(item),
            mode =
              item.payment_mode ||
              item.commission_distribution_payments?.at(-1)?.payment_mode ||
              item.payments?.at(-1)?.payment_mode ||
              "—";
          return `<tr><td>${esc(distTypeLabel(item.line_kind))}</td><td>${esc(item.party || "—")}</td><td>${esc(item.recipient_name || "—")}</td><td>${money(item.payable_aed)}${num(item.pct_of_base) ? ` (${fmt(item.pct_of_base)}%)` : ""}</td><td>${money(itemPaid)}</td><td>${money(num(item.payable_aed) - num(itemPaid))}</td><td>${esc(mode)}</td><td>&nbsp;</td></tr>`;
        })
        .join("") || `<tr><td colspan="8">—</td></tr>`;
    const receivedTotal = receipts.length
        ? receipts.reduce((sum, item) => sum + num(item.amount_aed), 0)
        : num(row.amount_received_aed),
      receivedDate =
        receipts.at(-1)?.received_date || row.commission_received_date,
      receivedMode = receipts.at(-1)?.receive_mode || row.receive_mode;
    const titleHtml = letterhead?.dataUrl
      ? `<img class="ps-letterhead" src="${letterhead.dataUrl}" alt="Letterhead">`
      : `<div class="ps-title">COMMISSION SHEET</div>`;
    const printHtml = `<div class="ps-page">${titleHtml}<div class="ps-metarow"><span>Form Ref: ${esc(row.form_ref || "—")}</span><span>Date: ${dateText(row.transaction_date)}</span></div><div class="ps-section"><div class="ps-section-head">1. CLIENT &amp; PROPERTY DETAILS</div><div class="ps-row">${cell("Client Name", esc(row.client_name))}${cell("Client Contact", esc(row.client_contact || "—"))}</div><div class="ps-row">${cell("Client ID Number", esc(row.client_id_number || "—"))}${cell("Client ID Expiry", dateText(row.client_id_expiry))}</div><div class="ps-row">${cell("Building / Project", esc(row.building_project || "—"))}${cell("Developer", esc(row.developer || "—"))}</div><div class="ps-row">${cell("Unit No", esc(row.unit_no || "—"))}${cell("Unit Type", esc(row.unit_type || "—"))}</div><div class="ps-row">${cell("Bedrooms", esc(row.bedrooms || "—"))}${cell("Unit Value (AED)", money(row.unit_value_aed))}</div></div><div class="ps-section"><div class="ps-section-head">2. DEAL INFORMATION</div><div class="ps-row">${cell("Company", esc(company))}${cell("Agent Name", esc(row.agent_name || "—"))}${cell("Team", esc(row.agent_team || "—"))}</div><div class="ps-section-body"><div class="ps-checkline"><strong>Deal Type:</strong> ${Object.entries(
      DEALS,
    )
      .map(([key, label]) => `${checked(row.deal_type === key)} ${label}`)
      .join(
        " &nbsp;&nbsp; ",
      )}</div><div class="ps-checkline"><strong>Lead Source:</strong> ${Object.entries(
      LEADS,
    )
      .map(
        ([key, label]) =>
          `${checked(row.lead_source === key)} ${label}${key === "other" && row.lead_source_other ? ` (${esc(row.lead_source_other)})` : ""}`,
      )
      .join(
        " &nbsp; ",
      )}</div></div></div><div class="ps-section"><div class="ps-section-head">3. COMMISSION SUMMARY</div><div class="ps-row">${cell("Gross Commission (AED)", `${money(row.gross_commission_aed)}${num(row.commission_pct) ? ` (${fmt(row.commission_pct)}%)` : ""}`)}${cell("VAT 5%", money(row.vat_amount_aed ?? round(num(row.gross_commission_aed) * 0.05)))}${cell("Total Payable (AED)", money(row.total_payable_aed ?? round(num(row.gross_commission_aed) * 1.05)))}</div></div><div class="ps-section"><div class="ps-section-head">4. CLIENT DOCUMENTS REQUIRED</div><div class="ps-doc-cols"><div class="ps-doc-col"><h4>${esc(DEALS[row.deal_type] || "Documents")}</h4>${docRowsWrapped}</div></div></div><div class="ps-section"><div class="ps-section-head">5. COMMISSION DISTRIBUTION</div><div class="ps-section-body cis-print-note">Total commission: ${money(row.gross_commission_aed)} &nbsp;·&nbsp; Total kickback: ${money(kickbackTotal)} &nbsp;·&nbsp; Remaining commission: ${money(retainedAmt)}</div><table class="ps-dist-table"><tr><th>Type</th><th>Party</th><th>Name / Company</th><th>Amount (AED)</th><th>Paid Amount (AED)</th><th>Balance (AED)</th><th>Payment Mode</th><th>Signature</th></tr>${distRows}</table></div><div class="ps-section"><div class="ps-section-head">6. ACCOUNTS TRACKING (FOR OFFICE USE)</div><div class="ps-row">${cell("Status", esc(row.tracking_status || "—"))}${cell("Invoice No", esc(row.invoice_no || "—"))}${cell("Invoice Sent (Date)", dateText(row.invoice_sent_date))}</div><div class="ps-row">${cell("Commission Received", dateText(receivedDate))}${cell("Receive Mode", esc(receivedMode || "—"))}${cell("Amount Received", money(receivedTotal))}</div><div class="ps-row">${cell("Commission Paid to Agent", dateText(row.commission_paid_date))}${cell("Payment Mode", esc(row.payment_mode_paid || "—"))}${cell("Amount Paid", money(row.finance_amount_paid_override_aed ?? row.calculated_amount_paid_aed))}</div><div class="ps-row">${cell("Paid to Client/Ext. Agent", dateText(row.paid_client_ext_date))}${cell("Paid to Client/Ext. Agent (AED)", money(row.paid_client_ext_amount))}${cell("Deductions (AED)", money(row.deductions_aed))}</div><div class="ps-row">${cell("Additional Payment (AED)", money(row.additional_payment_aed))}${cell("Net Agent Payable (AED)", money(row.net_agent_payable_aed))}${cell("Total Comm. After Deduction", money(row.total_after_deduction_aed))}</div>${row.remarks ? `<div class="ps-section-body"><strong>Remarks:</strong> ${esc(row.remarks)}</div>` : ""}</div><div class="ps-section"><div class="ps-section-head">7. APPROVALS</div><div class="ps-approvals"><div class="a"><div class="name">${row.prepared_by ? esc(row.prepared_by) : "&nbsp;"}</div><div class="line">Prepared By</div></div><div class="a"><div class="name">${row.manager ? esc(row.manager) : "&nbsp;"}</div><div class="line">Manager</div></div><div class="a"><div class="name">${row.accounts ? esc(row.accounts) : "&nbsp;"}</div><div class="line">Accounts</div></div></div></div></div>`;
    const popup = window.open(
      "",
      "_blank",
      "width=980,height=1040,scrollbars=yes,resizable=yes",
    );
    if (!popup)
      return setError(
        "Pop-up blocked — allow pop-ups for this page to use View.",
      );
    const popupCss = `body{margin:0;background:#f0f1ec;font-family:Arial,Helvetica,sans-serif}.vp-toolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#16232e;color:#fff}.vp-actions{display:flex;gap:8px}.vp-toolbar button{padding:7px 16px;border:0;border-radius:3px;background:#a9782e;color:#fff;cursor:pointer}.vp-toolbar .danger{background:#b23b3b}.vp-wrap{max-width:880px;margin:18px auto;padding:0 16px 40px}.ps-page{background:#fff;color:#111;font-size:11px}.ps-letterhead{display:block;width:100%;max-height:130px;object-fit:contain;margin:0 0 6px}.ps-title{text-align:center;font-size:18px;font-weight:700;letter-spacing:.05em;border:2px solid #111;padding:8px}.ps-metarow{display:flex;justify-content:space-between;border:1px solid #111;border-top:0;padding:5px 8px}.ps-section{border:1px solid #111;border-top:0}.ps-section-head{padding:4px 8px;background:#111;color:#fff;font-weight:700;letter-spacing:.03em}.ps-section-body{padding:7px 9px}.ps-row{display:flex;border-bottom:1px solid #ccc}.ps-row:last-child{border-bottom:0}.ps-cell{display:flex;flex:1;align-items:flex-start;gap:4px;min-width:0;padding:3px 6px;border-right:1px solid #ccc}.ps-cell:last-child{border-right:0}.ps-cell .l{flex:0 0 104px;color:#555;font-size:8.5px;line-height:1.25;text-transform:uppercase}.ps-cell .l:after{content:':'}.ps-cell .v{flex:1;font-size:10.5px;font-weight:600;line-height:1.3;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}.ps-checkline{padding:3px 0}.ps-doc-cols{display:flex}.ps-doc-col{flex:1;padding:4px 8px}.ps-doc-col h4{margin:0 0 5px;font-size:10px;text-transform:uppercase}.ps-doc-list{display:grid;grid-template-columns:repeat(2,1fr);column-gap:18px;row-gap:3px}.ps-doc-list>div{font-size:10.5px;overflow-wrap:break-word;word-break:break-word}.ps-dist-table{width:100%;border-collapse:collapse;font-size:10.5px}.ps-dist-table th,.ps-dist-table td{padding:5px 6px;border:1px solid #ccc;text-align:left}.cis-print-note{padding-bottom:0;color:#555;font-size:10px}.ps-approvals{display:flex}.ps-approvals .a{flex:1;padding:10px 8px;border-right:1px solid #ccc;text-align:center}.ps-approvals .a:last-child{border:0}.ps-approvals .name{min-height:14px;margin-bottom:18px;font-weight:600}.ps-approvals .line{padding-top:3px;border-top:1px solid #111;color:#555;font-size:9px;text-transform:uppercase}@media print{.vp-toolbar{display:none}.vp-wrap{max-width:none;margin:0;padding:0}body{background:#fff}}`;
    popup.document.write(
      `<!doctype html><html><head><meta charset="UTF-8"><title>${esc(row.form_ref || "Commission Sheet")}${row.client_name ? ` — ${esc(row.client_name)}` : ""}</title><style>${popupCss}</style></head><body><div class="vp-toolbar"><strong>${esc(row.form_ref || "Commission Sheet")}${row.client_name ? ` — ${esc(row.client_name)}` : ""}</strong><div class="vp-actions">${canMake ? `<button id="edit">Edit</button>` : ""}<button id="print">Print / Save PDF</button>${isSuper ? `<button id="delete" class="danger">Delete</button>` : ""}</div></div><div class="vp-wrap">${printHtml}</div></body></html>`,
    );
    popup.document.close();
    const propertySection = popup.document.querySelector(".ps-section");
    if (propertySection) {
      const bdmRow = popup.document.createElement("div");
      bdmRow.className = "ps-row";
      bdmRow.innerHTML =
        cell("Developer BDM", esc(row.developer_bdm_name || "—")) +
        cell("BDM Email", esc(row.developer_bdm_email || "—")) +
        cell("BDM Contact", esc(row.developer_bdm_contact || "—"));
      propertySection.appendChild(bdmRow);
    }
    popup.document.querySelector(".cis-print-note")?.remove();
    popup.document
      .getElementById("print")
      ?.addEventListener("click", () => popup.print());
    popup.document.getElementById("edit")?.addEventListener("click", () => {
      popup.close();
      edit(row);
    });
    popup.document.getElementById("delete")?.addEventListener("click", () => {
      popup.close();
      softDelete(row);
    });
  }
  function legacyPrint(row) {
    const company =
        companies.find((item) => item.id === row.company_id)?.name || "\u2014",
      lines = (row.commission_distribution_lines || row.distribution || [])
        .map(
          (item) =>
            `<tr><td>${esc(item.type_label || item.party || "\u2014")}</td><td>${esc(item.recipient_name || "\u2014")}</td><td>${money(item.payable_aed)}</td><td>${money(item.paid_aed || paid(item))}</td><td>${money(num(item.payable_aed) - num(item.paid_aed || paid(item)))}</td></tr>`,
        )
        .join(""),
      popup = window.open("", "_blank", "width=1100,height=850");
    if (!popup) return setError("Allow pop-ups to view and print.");
    popup.document.write(
      `<!doctype html><title>${esc(row.form_ref)}</title><style>body{font:12px Arial;margin:25px;color:#111}.page{max-width:950px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px}.logo{max-width:100%;max-height:100px}h2{font-size:12px;background:#17232f;color:#fff;padding:7px;margin:15px 0 0}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:7px;text-align:left}@media print{button{display:none}}</style><div class="page"><button onclick="print()">Print / Save PDF</button><div class="head">${letterhead?.dataUrl ? `<img class="logo" src="${letterhead.dataUrl}">` : "<h1>COMMISSION SHEET</h1>"}<div>${esc(row.form_ref)}<br>${dateText(row.transaction_date)}</div></div><h2>1. CLIENT & PROPERTY DETAILS</h2><table><tr><td>Client</td><td>${esc(row.client_name)}</td><td>Contact</td><td>${esc(row.client_contact || "\u2014")}</td></tr><tr><td>ID</td><td>${esc(row.client_id_number || "\u2014")}</td><td>ID expiry</td><td>${dateText(row.client_id_expiry)}</td></tr><tr><td>Project</td><td>${esc(row.building_project || "\u2014")}</td><td>Developer</td><td>${esc(row.developer || "\u2014")}</td></tr><tr><td>Unit</td><td>${esc(row.unit_no)}</td><td>Unit value</td><td>${money(row.unit_value_aed)}</td></tr></table><h2>2. DEAL INFORMATION</h2><table><tr><td>Company</td><td>${esc(company)}</td><td>Agent</td><td>${esc(row.agent_name || "\u2014")}</td><td>Team</td><td>${esc(row.agent_team || "\u2014")}</td></tr><tr><td>Deal type</td><td>${DEALS[row.deal_type]}</td><td>Lead source</td><td colspan="3">${LEADS[row.lead_source] || "\u2014"}</td></tr></table><h2>3. COMMISSION SUMMARY</h2><table><tr><td>Gross</td><td>${money(row.gross_commission_aed)}</td><td>VAT 5%</td><td>${money(row.vat_amount_aed)}</td><td>Total</td><td>${money(row.total_payable_aed)}</td></tr></table><h2>4. COMMISSION DISTRIBUTION</h2><table><tr><th>Type / Party</th><th>Recipient</th><th>Payable</th><th>Paid</th><th>Balance</th></tr>${lines}</table><h2>5. ACCOUNTS & APPROVALS</h2><table><tr><td>Status</td><td>${esc(row.tracking_status || "\u2014")}</td><td>Invoice</td><td>${esc(row.invoice_no || "\u2014")}</td></tr><tr><td>Prepared by</td><td>${esc(row.prepared_by || "\u2014")}</td><td>Manager / Accounts</td><td>${esc([row.manager, row.accounts].filter(Boolean).join(" / ") || "\u2014")}</td></tr></table></div>`,
    );
    popup.document.close();
  }
  async function addDoc() {
    const label = newDoc.document_label.trim();
    if (!label) return;
    const result = await supabase.from("commission_document_templates").upsert(
      {
        ...newDoc,
        document_code: label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, ""),
        sort_order:
          templates.filter((item) => item.deal_type === newDoc.deal_type)
            .length + 1,
      },
      {
        onConflict: "deal_type,document_code",
      },
    );
    if (result.error) setError(result.error.message);
    else {
      setNewDoc((current) => ({
        ...current,
        document_label: "",
      }));
      load();
    }
  }
  const removeDoc = async (item) => {
    if (confirm(`Remove ${item.document_label}?`)) {
      await supabase
        .from("commission_document_templates")
        .delete()
        .eq("id", item.id);
      load();
    }
  };
  async function addOption() {
    const label = newOption.label.trim();
    if (!label) return;
    const result = await supabase
      .from("commission_distribution_options")
      .upsert(
        {
          ...newOption,
          label,
          sort_order:
            options.filter((item) => item.option_kind === newOption.option_kind)
              .length + 1,
        },
        {
          onConflict: "option_kind,label",
        },
      );
    if (result.error) setError(result.error.message);
    else {
      setNewOption((current) => ({
        ...current,
        label: "",
      }));
      load();
    }
  }
  const removeOption = async (item) => {
    if (confirm(`Remove ${item.label}?`)) {
      await supabase
        .from("commission_distribution_options")
        .delete()
        .eq("id", item.id);
      load();
    }
  };
  const filtered = rows.filter(
    (row) =>
      (deleted ? !!row.deleted_at : !row.deleted_at) &&
      (!status || row.tracking_status === status) &&
      (!deal || row.deal_type === deal) &&
      (!dateFrom || row.transaction_date >= dateFrom) &&
      (!dateTo || row.transaction_date <= dateTo) &&
      (!search ||
        [
          row.form_ref,
          row.client_name,
          row.unit_no,
          row.building_project,
          row.developer,
          row.developer_bdm_name,
          row.developer_bdm_email,
          row.developer_bdm_contact,
          row.agent_name,
          row.agent_team,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const chrome = {
    form,
    compact,
    setCompact,
    wide,
    setWide,
    onEntry: () => setView("editor"),
    onDashboard: () => setView("dashboard"),
    onSetup: setup,
    onDate: (value) => set("transaction_date", value),
  };
  const showDriveConnectPrompt = !driveTokenValid() && !driveConnectDismissed;
  const driveConnectPrompt = showDriveConnectPrompt ? (
    <GoogleDriveConnectPrompt
      onConnect={connectGoogleDrive}
      onDismiss={() => setDriveConnectDismissed(true)}
    />
  ) : null;
  const attachmentViewerModal = (
    <AttachmentViewerModal
      viewer={viewer}
      onClose={closeAttachment}
      onDownload={downloadAttachment}
      onPrint={printAttachment}
      onRemove={removeAttachment}
    />
  );
  if (view === "setup")
    return (
      <>
        {driveConnectPrompt}
        {attachmentViewerModal}
        <CommissionChrome active="setup" {...chrome}>
          <Setup
            {...{
              letterhead,
              templates,
              options,
              newDoc,
              setNewDoc,
              newOption,
              setNewOption,
              chooseLetterhead,
              addDoc,
              removeDoc,
              addOption,
              removeOption,
              isSuper,
              canFinance,
              rows,
              companies,
              error,
              notice,
              restore,
              purge,
              user,
              load,
              driveEmail,
              driveTokenValid: driveTokenValid(),
              connectGoogleDrive,
            }}
          />
        </CommissionChrome>
      </>
    );
  if (view === "editor")
    return (
      <>
        {driveConnectPrompt}
        {attachmentViewerModal}
        <CommissionChrome active="editor" {...chrome}>
          <Editor
            {...{
              form,
              set,
              setForm,
              companies,
              rows,
              types,
              parties,
              activeDocs,
              files,
              setFiles,
              gross,
              vat,
              total,
              residual,
              kickbackTotal,
              retained,
              distComputed,
              paid,
              allPaid,
              received,
              expectedPayable,
              canFinance,
              canMake,
              saving,
              error,
              notice,
              client,
              matchClientBy,
              selectDeveloperBdm,
              updateLine,
              finalizeAllocationLine,
              insertLine,
              addPay,
              updatePay,
              removePay,
              addReceipt,
              updateReceipt,
              setup,
              save,
              driveTokenValid: driveTokenValid(),
              shareTransaction,
              openAttachment,
              previewLocalFile,
              print,
              fresh,
            }}
            onCancel={() => setView("dashboard")}
          />
        </CommissionChrome>
      </>
    );
  return (
    <>
      {driveConnectPrompt}
      {attachmentViewerModal}
      <CommissionChrome active="dashboard" {...chrome}>
        <Dashboard
          {...{
            filtered,
            companies,
            loading,
            error,
            notice,
            search,
            setSearch,
            status,
            setStatus,
            deal,
            setDeal,
            dateFrom,
            setDateFrom,
            dateTo,
            setDateTo,
            canMake,
            isSuper,
            fresh,
            edit,
            softDelete,
            print,
            openAttachment,
          }}
        />
      </CommissionChrome>
    </>
  );
}
function Dashboard(p) {
  const [expandedRow, setExpandedRow] = useState(null);
  const sumGross = p.filtered.reduce(
      (sum, row) => sum + num(row.gross_commission_aed),
      0,
    ),
    sumVat = p.filtered.reduce((sum, row) => sum + num(row.vat_amount_aed), 0),
    sumTotal = p.filtered.reduce(
      (sum, row) => sum + num(row.total_payable_aed),
      0,
    );
  return (
    <main className="cis-wrap cis-dashboard">
      <h2 className="cis-dash-title">Transactions dashboard</h2>
      {p.error && <div className="alert alert-error">{p.error}</div>}
      {p.notice && <div className="alert alert-success">{p.notice}</div>}
      <div className="cis-dash-filters">
        <Field label="Search">
          <input
            className="form-control"
            placeholder="Client, unit no, form ref…"
            value={p.search}
            onChange={(e) => p.setSearch(e.target.value)}
          />
        </Field>
        <Field label="Deal type">
          <select
            className="form-control"
            value={p.deal}
            onChange={(e) => p.setDeal(e.target.value)}
          >
            <option value="">All</option>
            {Object.entries(DEALS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className="form-control"
            value={p.status}
            onChange={(e) => p.setStatus(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <DateInput value={p.dateFrom} onChange={p.setDateFrom} />
        </Field>
        <Field label="To">
          <DateInput value={p.dateTo} onChange={p.setDateTo} />
        </Field>
      </div>
      <div className="cis-dash-summary">
        <div>
          <label>Transactions</label>
          <b>{p.filtered.length}</b>
        </div>
        <div>
          <label>Gross commission</label>
          <b>{money(sumGross)}</b>
        </div>
        <div>
          <label>VAT 5%</label>
          <b>{money(sumVat)}</b>
        </div>
        <div>
          <label>Total payable</label>
          <b>{money(sumTotal)}</b>
        </div>
      </div>
      <div className="cis-dash-table">
        <table>
          <thead>
            <tr>
              <th>Form ref</th>
              <th>Date</th>
              <th>Client</th>
              <th>Unit</th>
              <th>Deal type</th>
              <th>Internal Agent</th>
              <th>Gross</th>
              <th>VAT</th>
              <th>Total</th>
              <th>Status</th>
              <th>Files</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.loading ? (
              <tr>
                <td colSpan="12">Loading…</td>
              </tr>
            ) : p.filtered.length ? (
              p.filtered.map((row) => {
                const docs = (row.commission_sheet_documents || []).filter(
                  (doc) => doc.is_selected && doc.local_file_name,
                );
                const fileCount = docs.reduce(
                  (sum, doc) =>
                    sum + doc.local_file_name.split("|").filter(Boolean).length,
                  0,
                );
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.form_ref}</td>
                      <td>{dateText(row.transaction_date)}</td>
                      <td>{row.client_name || "—"}</td>
                      <td>{row.unit_no || "—"}</td>
                      <td>{DEALS[row.deal_type] || "—"}</td>
                      <td>
                        {(row.commission_distribution_lines || [])
                          .filter((item) => item.party === "Internal Agent")
                          .map((item) => item.recipient_name)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td>{fmt(row.gross_commission_aed)}</td>
                      <td>{fmt(row.vat_amount_aed)}</td>
                      <td>{fmt(row.total_payable_aed)}</td>
                      <td>
                        {row.tracking_status ? (
                          <span className="cis-status-badge">
                            {row.tracking_status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {fileCount ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              setExpandedRow((current) =>
                                current === row.id ? null : row.id,
                              )
                            }
                          >
                            📎 {fileCount}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="cis-actions">
                        <button type="button" onClick={() => p.print(row)}>
                          View
                        </button>
                        {p.canMake && (
                          <button type="button" onClick={() => p.edit(row)}>
                            Edit
                          </button>
                        )}
                        {p.isSuper && (
                          <button
                            type="button"
                            onClick={() => p.softDelete(row)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedRow === row.id && (
                      <tr>
                        <td colSpan="12">
                          <ul
                            style={{
                              listStyle: "none",
                              margin: 0,
                              padding: 0,
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            {docs.flatMap((doc) => {
                              const names = doc.local_file_name
                                .split("|")
                                .filter(Boolean);
                              return names.map((name, index) => (
                                <li
                                  key={`${doc.document_code}-${index}`}
                                  style={{
                                    background: "#eef2ff",
                                    borderRadius: 4,
                                    padding: "2px 8px",
                                    fontSize: 12,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="cis-link"
                                    onClick={() =>
                                      p.openAttachment({
                                        folderId: doc.local_folder_label,
                                        diskName: buildDiskName(
                                          doc.document_code,
                                          name,
                                          index,
                                          names.length,
                                        ),
                                        displayName: name,
                                        canRemove: false,
                                      })
                                    }
                                  >
                                    {doc.document_label}: {name}
                                  </button>
                                </li>
                              ));
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan="12" className="cis-empty">
                  No transactions match — record one in New Entry, or adjust the
                  filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
function Editor(p) {
  const docs = p.activeDocs.length
      ? p.activeDocs
      : DEFAULT_DOCS[p.form.deal_type]?.map(
          ([document_code, document_label]) => ({
            document_code,
            document_label,
            is_required: false,
          }),
        ) || [],
    history = (key) => p.rows.map((row) => row[key]);
  const developerBdmHistory = p.rows.filter(
      (row) =>
        row.developer_bdm_name &&
        (!p.form.developer ||
          row.developer?.trim().toLowerCase() ===
            p.form.developer.trim().toLowerCase()),
    ),
    projectBdmHistory = developerBdmHistory.filter(
      (row) =>
        p.form.building_project &&
        row.building_project?.trim().toLowerCase() ===
          p.form.building_project.trim().toLowerCase(),
    ),
    availableBdms = projectBdmHistory.length
      ? projectBdmHistory
      : developerBdmHistory;
  let distSplitIndex = 0;
  while (
    distSplitIndex < p.form.distribution.length &&
    isKickback(p.form.distribution[distSplitIndex].line_kind)
  )
    distSplitIndex++;
  const kickbackPctTotal = p.form.distribution
      .slice(0, distSplitIndex)
      .reduce((sum, item) => sum + num(item.pct_of_base), 0),
    allocationPctTotal = p.form.distribution
      .slice(distSplitIndex)
      .reduce((sum, item) => sum + num(item.pct_of_base), 0),
    overAllocated = kickbackPctTotal > 100.01 || allocationPctTotal > 100.01;
  const hasEnteredData =
    !!p.form.id ||
    [
      "company_id",
      "client_name",
      "client_contact",
      "client_id_number",
      "client_id_expiry",
      "building_project",
      "developer",
      "developer_bdm_name",
      "developer_bdm_email",
      "developer_bdm_contact",
      "unit_no",
      "unit_type",
      "bedrooms",
      "unit_value_aed",
      "agent_name",
      "agent_team",
      "deal_type",
      "lead_source",
      "lead_source_other",
      "commission_pct",
      "gross_commission_aed",
      "remarks",
    ].some((key) => String(p.form[key] ?? "").trim()) ||
    p.form.distribution.length > 0 ||
    p.form.receipts.length > 0 ||
    p.form.documents.some((document) => document.is_selected) ||
    Object.values(p.files).some(Boolean);
  const confirmReset = (message, action) => {
    if (!hasEnteredData || window.confirm(message)) action();
  };
  const clearForm = () => {
    p.setForm(empty());
    p.setFiles({});
  };
  return (
    <form
      className="cis-wrap cis-entry"
      onSubmit={p.save}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target.tagName !== "TEXTAREA" &&
          event.target.type !== "submit"
        ) {
          event.preventDefault();
        }
      }}
    >
      <div className="cis-entry-heading">
        <div>
          <h1>
            {p.form.id ? `Edit ${p.form.form_ref}` : "New Commission Sheet"}
          </h1>
          <p>Required fields are marked *. Dates use dd-MMM-yyyy.</p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={p.onCancel}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!p.canMake || p.saving}>
            {p.saving ? "Saving\u2026" : "Save transaction"}
          </button>
        </div>
      </div>
      {p.error && <div className="alert alert-error">{p.error}</div>}
      {p.notice && <div className="alert alert-success">{p.notice}</div>}
      <List id="cis-clients" values={history("client_name")} />
      <List id="cis-projects" values={history("building_project")} />
      <List id="cis-developers" values={history("developer")} />
      <List
        id="cis-developer-bdms"
        values={availableBdms.map((row) => row.developer_bdm_name)}
      />
      <List id="cis-agents" values={history("agent_name")} />
      <List id="cis-teams" values={history("agent_team")} />
      <List
        id="cis-recipients"
        values={p.rows.flatMap((row) =>
          (row.commission_distribution_lines || []).map(
            (item) => item.recipient_name,
          ),
        )}
      />
      <Section number="1" title="Client & property details">
        <div className="form-row-3">
          <Field label="Client name" required>
            <input
              className="form-control"
              list="cis-clients"
              required
              value={p.form.client_name}
              onChange={(e) => p.client(e.target.value)}
              placeholder="Full name as on ID"
            />
          </Field>
          <Field label="Client contact (phone / email)">
            <input
              className="form-control"
              value={p.form.client_contact}
              onChange={(e) => p.set("client_contact", e.target.value)}
              onBlur={(e) => p.matchClientBy("client_contact", e.target.value)}
              placeholder="+971… or email"
            />
          </Field>
          <Field label="Client ID number">
            <input
              className="form-control"
              value={p.form.client_id_number}
              onChange={(e) => p.set("client_id_number", e.target.value)}
              onBlur={(e) =>
                p.matchClientBy("client_id_number", e.target.value)
              }
            />
          </Field>
          <Field label="Client ID expiry">
            <DateInput
              value={p.form.client_id_expiry}
              onChange={(value) => p.set("client_id_expiry", value)}
            />
          </Field>
          <Field label="Building / project">
            <input
              className="form-control"
              list="cis-projects"
              value={p.form.building_project}
              onChange={(e) => p.set("building_project", e.target.value)}
              placeholder="Start typing or pick"
            />
          </Field>
          <Field label="Developer">
            <input
              className="form-control"
              list="cis-developers"
              value={p.form.developer}
              onChange={(e) => p.set("developer", e.target.value)}
              placeholder="Start typing or pick"
            />
          </Field>
          <Field label="Developer BDM name">
            <input
              className="form-control"
              list="cis-developer-bdms"
              value={p.form.developer_bdm_name}
              onChange={(e) => p.selectDeveloperBdm(e.target.value)}
              placeholder="Start typing or pick"
            />
          </Field>
          <Field label="Developer BDM email">
            <input
              className="form-control"
              type="email"
              value={p.form.developer_bdm_email}
              onChange={(e) => p.set("developer_bdm_email", e.target.value)}
            />
          </Field>
          <Field label="Developer BDM contact">
            <input
              className="form-control"
              type="tel"
              value={p.form.developer_bdm_contact}
              onChange={(e) =>
                p.set("developer_bdm_contact", e.target.value)
              }
            />
          </Field>
          <Field label="Unit no" required>
            <input
              className="form-control"
              required
              value={p.form.unit_no}
              onChange={(e) => p.set("unit_no", e.target.value)}
            />
          </Field>
          <Field label="Unit type">
            <input
              className="form-control"
              list="cis-units"
              value={p.form.unit_type}
              onChange={(e) => p.set("unit_type", e.target.value)}
              placeholder="Start typing or pick"
            />
            <List id="cis-units" values={[...UNITS, ...history("unit_type")]} />
          </Field>
          <Field label="Bedrooms">
            <input
              className="form-control"
              value={p.form.bedrooms}
              onChange={(e) => p.set("bedrooms", e.target.value)}
              list="cis-bedrooms"
              placeholder="Start typing or pick"
            />
            <List
              id="cis-bedrooms"
              values={["Studio", "1", "2", "3", "4", "5", "6+", "Penthouse"]}
            />
          </Field>
          <Field label="Unit value (AED)">
            <Amount
              value={p.form.unit_value_aed}
              onChange={(value) => {
                p.set("unit_value_aed", value);
                if (num(value) && p.form.commission_pct)
                  p.set(
                    "gross_commission_aed",
                    round((num(value) * num(p.form.commission_pct)) / 100),
                  );
              }}
            />
          </Field>
        </div>
      </Section>
      <Section number="2" title="Deal information">
        <div className="form-row-3">
          <Field label="Company" required>
            <select
              className="form-control"
              required
              value={p.form.company_id}
              onChange={(e) => p.set("company_id", e.target.value)}
            >
              <option value="">Select</option>
              {p.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Agent name">
            <input
              className="form-control"
              list="cis-agents"
              value={p.form.agent_name}
              onChange={(e) => p.set("agent_name", e.target.value)}
            />
          </Field>
          <Field label="Team">
            <input
              className="form-control"
              list="cis-teams"
              value={p.form.agent_team}
              onChange={(e) => p.set("agent_team", e.target.value)}
            />
          </Field>
          <Field label="Transaction date" required>
            <DateInput
              required
              value={p.form.transaction_date}
              onChange={(value) => p.set("transaction_date", value)}
            />
          </Field>
          <Field label="Lead source">
            <select
              className="form-control"
              value={p.form.lead_source}
              onChange={(e) => p.set("lead_source", e.target.value)}
            >
              <option value="">Select</option>
              {Object.entries(LEADS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {p.form.lead_source === "other" && (
            <Field label="Lead source — other">
              <input
                className="form-control"
                value={p.form.lead_source_other}
                onChange={(e) => p.set("lead_source_other", e.target.value)}
              />
            </Field>
          )}
        </div>
        <Field label="Deal type" required>
          <div className="cis-radio">
            {Object.entries(DEALS).map(([v, l]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="deal"
                  checked={p.form.deal_type === v}
                  onChange={() => p.set("deal_type", v)}
                />{" "}
                {l}
              </label>
            ))}
          </div>
        </Field>
      </Section>
      <Section number="3" title="Commission summary">
        <div className="cis-summary">
          <Field label="Commission payout %">
            <Amount
              value={p.form.commission_pct}
              onChange={(value) => {
                p.set("commission_pct", value);
                if (num(p.form.unit_value_aed))
                  p.set(
                    "gross_commission_aed",
                    round((num(p.form.unit_value_aed) * num(value)) / 100),
                  );
              }}
            />
          </Field>
          <Field label="Gross commission (AED)" required>
            <Amount
              required
              value={p.form.gross_commission_aed}
              onChange={(value) => {
                p.set("gross_commission_aed", value);
                if (num(p.form.unit_value_aed))
                  p.set(
                    "commission_pct",
                    round((num(value) / num(p.form.unit_value_aed)) * 100),
                  );
              }}
            />
          </Field>
          <Field label="VAT 5% (AED)">
            <Amount readOnly value={p.vat} />
          </Field>
          <Field label="Total payable (AED)">
            <Amount readOnly value={p.total} />
          </Field>
        </div>
        <p className="form-hint">
          Enter payout % or gross commission. The paired field, VAT and total
          update automatically.
        </p>
      </Section>
      <Section
        number="4"
        title="Client documents required"
        aside={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={p.setup}
          >
            Manage setup
          </button>
        }
      >
        <div className={`cis-folder ${p.driveTokenValid ? "ok" : "missing"}`}>
          <b>
            {p.driveTokenValid
              ? "Google Drive connected"
              : "Google Drive not connected"}
          </b>
          <span>
            {p.driveTokenValid
              ? "Attachments will be saved to your Google Drive."
              : "Open Setup to connect Google Drive before saving attachments."}
          </span>
        </div>
        {!p.form.deal_type ? (
          <div className="cis-empty">
            Select a deal type to show its checklist.
          </div>
        ) : (
          <div className="cis-docs">
            {docs.map((item) => {
              const doc =
                p.form.documents.find(
                  (d) => d.document_code === item.document_code,
                ) || {};
              return (
                <div className="cis-doc" key={item.document_code}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!doc.is_selected}
                      onChange={(e) =>
                        p.setForm((current) => ({
                          ...current,
                          documents: current.documents.map((d) =>
                            d.document_code === item.document_code
                              ? {
                                  ...d,
                                  is_selected: e.target.checked,
                                }
                              : d,
                          ),
                        }))
                      }
                    />{" "}
                    {item.document_label}
                    {item.is_required && <span className="required"> *</span>}
                  </label>
                  {doc.is_selected && (
                    <>
                      <input
                        className="form-control"
                        type="file"
                        multiple
                        onChange={(e) => {
                          const picked = Array.from(e.target.files || []);
                          if (!picked.length) return;
                          p.setFiles((current) => ({
                            ...current,
                            [item.document_code]: [
                              ...(current[item.document_code] || []),
                              ...picked,
                            ],
                          }));
                          e.target.value = "";
                        }}
                      />
                      {p.files[item.document_code]?.length ? (
                        <ul
                          className="cis-doc-files"
                          style={{
                            listStyle: "none",
                            margin: "4px 0 0",
                            padding: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          {p.files[item.document_code].map((file, fileIndex) => (
                            <li
                              key={`${file.name}-${fileIndex}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                fontSize: 12,
                                background: "#f3f4f6",
                                borderRadius: 4,
                                padding: "2px 8px",
                              }}
                            >
                              <button
                                type="button"
                                className="cis-link"
                                onClick={() => p.previewLocalFile(file)}
                              >
                                {file.name}
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  p.setFiles((current) => ({
                                    ...current,
                                    [item.document_code]: current[
                                      item.document_code
                                    ].filter((_, i) => i !== fileIndex),
                                  }))
                                }
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : doc.local_file_name ? (
                        <ul
                          className="cis-doc-files"
                          style={{
                            listStyle: "none",
                            margin: "4px 0 0",
                            padding: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          {doc.local_file_name
                            .split("|")
                            .filter(Boolean)
                            .map((name, fileIndex, names) => (
                              <li
                                key={`${name}-${fileIndex}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  fontSize: 12,
                                  background: "#eef2ff",
                                  borderRadius: 4,
                                  padding: "2px 8px",
                                }}
                              >
                                <button
                                  type="button"
                                  className="cis-link"
                                  onClick={() =>
                                    p.openAttachment({
                                      folderId: doc.local_folder_label,
                                      diskName: buildDiskName(
                                        item.document_code,
                                        name,
                                        fileIndex,
                                        names.length,
                                      ),
                                      displayName: name,
                                      canRemove: true,
                                      onRemoved: () =>
                                        p.setForm((current) => ({
                                          ...current,
                                          documents: current.documents.map(
                                            (d) => {
                                              if (
                                                d.document_code !==
                                                item.document_code
                                              )
                                                return d;
                                              const remaining = names.filter(
                                                (_, i) => i !== fileIndex,
                                              );
                                              return {
                                                ...d,
                                                local_file_name:
                                                  remaining.length
                                                    ? remaining.join("|")
                                                    : null,
                                              };
                                            },
                                          ),
                                        })),
                                    })
                                  }
                                >
                                  {name}
                                </button>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <small>
                          Attachment required — add one file per page (e.g. 5
                          passport pages)
                        </small>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
      <Distribution {...p} />
      {p.canFinance && <Accounts {...p} />}
      <Section number="7" title="Approvals">
        <div className="form-row-3">
          <Field label="Prepared by">
            <input
              className="form-control"
              value={p.form.prepared_by}
              onChange={(e) => p.set("prepared_by", e.target.value)}
            />
          </Field>
          <Field label="Manager">
            <input
              className="form-control"
              value={p.form.manager}
              onChange={(e) => p.set("manager", e.target.value)}
            />
          </Field>
          <Field label="Accounts">
            <input
              className="form-control"
              value={p.form.accounts}
              onChange={(e) => p.set("accounts", e.target.value)}
            />
          </Field>
        </div>
      </Section>
      <div className="cis-actionbar">
        <span>
          {p.error ||
            p.notice ||
            (p.form.id
              ? `Editing ${p.form.form_ref}`
              : "Fill required fields, then save the transaction.")}
        </span>
        <div>
          {p.form.id && (
            <button type="button" className="btn ghost" onClick={p.onCancel}>
              Cancel edit
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              confirmReset(
                "Clear all entered information from this form?",
                clearForm,
              )
            }
          >
            Clear form
          </button>
          <button
            type="button"
            className="btn"
            disabled={!p.form.id}
            onClick={() => p.print(p.form)}
          >
            Print / Save PDF
          </button>
          <button
            type="button"
            className="btn"
            disabled={!p.form.id}
            onClick={() => p.shareTransaction(p.form)}
            title="Anyone with the link can view, add, and edit these files"
          >
            Share attachments
          </button>
          <button
            className="btn primary"
            disabled={!p.canMake || p.saving || overAllocated}
            title={
              overAllocated
                ? "Fix the over-100% allocation in Section 5 before saving."
                : undefined
            }
          >
            {p.saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              confirmReset(
                "Start a new transaction and discard the information currently entered?",
                p.fresh,
              )
            }
          >
            New transaction
          </button>
        </div>
      </div>
    </form>
  );
}
function Distribution(p) {
  const [focusRowId, setFocusRowId] = useState(null);
  const rowRefs = useRef({});
  useEffect(() => {
    if (focusRowId && rowRefs.current[focusRowId]) {
      rowRefs.current[focusRowId].focus();
      setFocusRowId(null);
    }
  }, [focusRowId, p.form.distribution]);
  let splitIndex = 0;
  while (
    splitIndex < p.form.distribution.length &&
    isKickback(p.form.distribution[splitIndex].line_kind)
  )
    splitIndex++;
  const rows = p.form.distribution.map((item, index) => ({
      item,
      index,
      computed: p.distComputed[index] || item,
    })),
    topRows = rows.slice(0, splitIndex),
    restRows = rows.slice(splitIndex),
    afterTop = splitIndex
      ? rows[splitIndex - 1].computed.remaining_after
      : round(p.gross),
    topPctTotal = topRows.reduce(
      (sum, row) => sum + num(row.item.pct_of_base),
      0,
    ),
    restPctTotal = restRows.reduce(
      (sum, row) => sum + num(row.item.pct_of_base),
      0,
    ),
    topOverAllocated = topPctTotal > 100.01,
    restOverAllocated = restPctTotal > 100.01;
  const paymentRows = (item, lineIndex, colSpan) =>
    item.payments.map((entry, paymentIndex) => (
      <tr className="cis-payment-row" key={entry.id}>
        <td colSpan={colSpan}>
          <div className="cis-split">
            <DateInput
              required
              value={entry.payment_date}
              onChange={(value) =>
                p.updatePay(lineIndex, paymentIndex, "payment_date", value)
              }
            />
            <Amount
              required
              value={entry.amount_aed}
              onChange={(value) =>
                p.updatePay(lineIndex, paymentIndex, "amount_aed", value)
              }
            />
            <select
              className="form-control"
              value={entry.payment_mode}
              onChange={(event) =>
                p.updatePay(
                  lineIndex,
                  paymentIndex,
                  "payment_mode",
                  event.target.value,
                )
              }
            >
              <option value="">Mode</option>
              {MODES.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
            <input
              className="form-control"
              placeholder="Instrument #"
              value={entry.instrument_no}
              onChange={(event) =>
                p.updatePay(
                  lineIndex,
                  paymentIndex,
                  "instrument_no",
                  event.target.value,
                )
              }
            />
            <input
              className="form-control"
              placeholder="Notes"
              value={entry.notes}
              onChange={(event) =>
                p.updatePay(
                  lineIndex,
                  paymentIndex,
                  "notes",
                  event.target.value,
                )
              }
            />
            <button
              type="button"
              className="btn"
              onClick={() => p.removePay(lineIndex, paymentIndex)}
            >
              ×
            </button>
          </div>
        </td>
      </tr>
    ));
  const amountCell = (computed, lineIndex) => (
    <>
      <span
        className={`cis-balance ${num(computed.payable_aed) - p.paid(computed) > 0 ? "due" : "settled"}`}
      >
        {money(p.paid(computed))}
      </span>
      <button
        type="button"
        className="cis-link"
        onClick={() => p.addPay(lineIndex)}
      >
        + payment
      </button>
    </>
  );
  const rowActions = (index) => (
    <button
      type="button"
      className="btn"
      onClick={() =>
        p.setForm((current) => ({
          ...current,
          distribution: current.distribution.filter(
            (_, rowIndex) => rowIndex !== index,
          ),
        }))
      }
    >
      ×
    </button>
  );
  return (
    <Section number="5" title="Commission distribution">
      <div className="cis-bases">
        <span>
          Total commission: <b>{money(p.gross)}</b>
        </span>
        <span>
          Total kickback: <b>{money(p.kickbackTotal)}</b>
        </span>
        <span>
          Remaining commission (auto-calculated): <b>{money(p.retained)}</b>
        </span>
      </div>
      <div className="cis-subhead">
        <h3>5a. Kickback (from total commission)</h3>
      </div>
      <p className="form-hint">
        Kickback given back to the client or external referrer, calculated
        against the total commission ({money(p.gross)}). Every row here is
        calculated independently against that same total — add more than
        one row if the kickback is split between parties.
      </p>
      <div className="table-wrap">
        <table className="cis-dist">
          <thead>
            <tr>
              <th>Party</th>
              <th>Name / company</th>
              <th>%</th>
              <th>Base (AED)</th>
              <th>Kickback amount (AED)</th>
              <th>Paid amount (AED)</th>
              <th>Balance (AED)</th>
              <th>Payment mode</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {topRows.length === 0 && (
              <tr>
                <td colSpan="10" className="form-hint">
                  No kickback — full commission carries into 5b.
                </td>
              </tr>
            )}
            {topRows.map(({ item, index, computed }) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <select
                      ref={(el) => {
                        rowRefs.current[item.id] = el;
                      }}
                      className="form-control"
                      value={item.party || ""}
                      onChange={(event) =>
                        p.updateLine(index, "party", event.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {p.parties.map((party) => (
                        <option key={party}>{party}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="form-control"
                      list="cis-recipients"
                      value={item.recipient_name || ""}
                      onChange={(event) =>
                        p.updateLine(
                          index,
                          "recipient_name",
                          event.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <Amount
                      value={item.pct_of_base ?? ""}
                      onChange={(value) =>
                        p.updateLine(index, "pct_of_base", value)
                      }
                    />
                  </td>
                  <td>
                    <span className="form-hint">
                      {money(computed.base_aed)}
                    </span>
                  </td>
                  <td>
                    <Amount
                      value={computed.payable_aed ?? ""}
                      onChange={(value) =>
                        p.updateLine(index, "payable_aed", value)
                      }
                    />
                  </td>
                  <td>{amountCell(computed, index)}</td>
                  <td>
                    <span className="cis-balance">
                      {money(num(computed.payable_aed) - p.paid(computed))}
                    </span>
                  </td>
                  <td>{item.payments.at(-1)?.payment_mode || "—"}</td>
                  <td>
                    <input
                      className="form-control"
                      value={item.notes || ""}
                      onChange={(event) =>
                        p.updateLine(index, "notes", event.target.value)
                      }
                    />
                  </td>
                  <td>{rowActions(index)}</td>
                </tr>
                {paymentRows(item, index, 10)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          const newLine = line("kickback_agent", "Kickback", "");
          p.insertLine(splitIndex, newLine);
          setFocusRowId(newLine.id);
        }}
      >
        + Add kickback
      </button>
      {topOverAllocated && (
        <p className="alert alert-error">
          5a kickback percentages add up to {fmt(topPctTotal)}% of total
          commission — that's over 100%. Fix this before you can save.
        </p>
      )}
      <div className="cis-subhead">
        <h3>5b. Remaining commission allocation</h3>
      </div>
      <p className="form-hint strong">
        Remaining commission entering 5b — 100% base here: {money(afterTop)}
      </p>
      <p className="form-hint">
        Every row here is calculated independently against the remaining
        commission above ({money(afterTop)}) — rows don't reduce the base
        for each other. Use the <b>Type</b> column only if a row here should
        also count as kickback for reporting purposes; the calculation is
        the same either way.
      </p>
      <div className="table-wrap">
        <table className="cis-dist">
          <thead>
            <tr>
              <th>Type</th>
              <th>Party</th>
              <th>Name / company</th>
              <th>%</th>
              <th>Base (AED)</th>
              <th>Amount (AED)</th>
              <th>Paid amount (AED)</th>
              <th>Balance (AED)</th>
              <th>Payment mode</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {restRows.length === 0 && (
              <tr>
                <td colSpan="11" className="form-hint">
                  No rows yet.
                </td>
              </tr>
            )}
            {restRows.map(({ item, index, computed }) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <select
                      ref={(el) => {
                        rowRefs.current[item.id] = el;
                      }}
                      className="form-control"
                      value={item.line_kind || ""}
                      onChange={(event) =>
                        p.updateLine(index, "line_kind", event.target.value)
                      }
                    >
                      {DIST_TYPE_OPTIONS.map(([kind, label]) => (
                        <option key={kind} value={kind}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="form-control"
                      value={item.party || ""}
                      onChange={(event) =>
                        p.updateLine(index, "party", event.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {p.parties.map((party) => (
                        <option key={party}>{party}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="form-control"
                      list="cis-recipients"
                      value={item.recipient_name || ""}
                      onChange={(event) =>
                        p.updateLine(
                          index,
                          "recipient_name",
                          event.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <Amount
                      value={item.pct_of_base ?? ""}
                      onChange={(value) =>
                        p.updateLine(index, "pct_of_base", value)
                      }
                      onBlur={() => p.finalizeAllocationLine(index)}
                    />
                  </td>
                  <td>
                    <span className="form-hint">
                      {money(computed.base_aed)}
                    </span>
                  </td>
                  <td>
                    <Amount
                      value={computed.payable_aed ?? ""}
                      onChange={(value) =>
                        p.updateLine(index, "payable_aed", value)
                      }
                      onBlur={() => p.finalizeAllocationLine(index)}
                    />
                  </td>
                  <td>{amountCell(computed, index)}</td>
                  <td>
                    <span className="cis-balance">
                      {money(num(computed.payable_aed) - p.paid(computed))}
                    </span>
                  </td>
                  <td>{item.payments.at(-1)?.payment_mode || "—"}</td>
                  <td>
                    <input
                      className="form-control"
                      value={item.notes || ""}
                      onChange={(event) =>
                        p.updateLine(index, "notes", event.target.value)
                      }
                    />
                  </td>
                  <td>{rowActions(index)}</td>
                </tr>
                {paymentRows(item, index, 11)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          const newLine = line("residual", "Commission", "Internal Agent");
          if (restRows.length === 0) newLine.pct_of_base = 100;
          p.setForm((current) => ({
            ...current,
            distribution: recalcDistribution(
              [...current.distribution, newLine],
              num(current.gross_commission_aed),
            ).map(({ base_aed, remaining_after, ...rest }) => rest),
          }));
          setFocusRowId(newLine.id);
        }}
      >
        + Add row
      </button>
      {restOverAllocated && (
        <p className="alert alert-error">
          5b allocation percentages add up to {fmt(restPctTotal)}% of the
          remaining commission — that's over 100%. Fix this before you can
          save.
        </p>
      )}
      <p className="form-hint">
        Remaining commission after all rows above: <b>{money(p.retained)}</b>{" "}
        · Paid across all payment splits: {money(p.allPaid)}
      </p>
      <p className="form-hint">
        “Paid amount” here totals into Section 6 automatically.
      </p>
    </Section>
  );
}
function LegacyDistribution(p) {
  return (
    <Section
      number="5"
      title="Commission distribution"
      aside={
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            p.setForm((current) => ({
              ...current,
              distribution: [
                ...current.distribution,
                line("residual", p.types[0] || "Residual Allocation", "Agent"),
              ],
            }))
          }
        >
          + Add row
        </button>
      }
    >
      <div className="cis-bases">
        <b>Commission receivable: {money(p.gross)}</b>
        <b>Residual after off-the-top items: {money(p.residual)}</b>
      </div>
      <div className="table-wrap">
        <table className="cis-dist">
          <thead>
            <tr>
              <th>Type</th>
              <th>Party</th>
              <th>Recipient</th>
              <th>%</th>
              <th>Payable</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.form.distribution.map((item, i) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <select
                      className="form-control"
                      value={item.type_label || ""}
                      onChange={(e) =>
                        p.updateLine(i, "type_label", e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {[
                        .../* @__PURE__ */ new Set([
                          ...TOP.map(([, l]) => l),
                          ...p.types,
                        ]),
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="form-control"
                      value={item.party || ""}
                      onChange={(e) => p.updateLine(i, "party", e.target.value)}
                    >
                      <option value="">Select</option>
                      {p.parties.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="form-control"
                      list="cis-recipients"
                      value={item.recipient_name || ""}
                      onChange={(e) =>
                        p.updateLine(i, "recipient_name", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <Amount
                      value={item.pct_of_base ?? ""}
                      onChange={(v) => p.updateLine(i, "pct_of_base", v)}
                    />
                  </td>
                  <td>
                    <Amount
                      value={item.payable_aed ?? ""}
                      onChange={(v) => p.updateLine(i, "payable_aed", v)}
                    />
                  </td>
                  <td>
                    {money(p.paid(item))}
                    <button
                      type="button"
                      className="cis-link"
                      onClick={() => p.addPay(i)}
                    >
                      + payment
                    </button>
                  </td>
                  <td>{money(num(item.payable_aed) - p.paid(item))}</td>
                  <td>
                    <input
                      className="form-control"
                      value={item.notes || ""}
                      onChange={(e) => p.updateLine(i, "notes", e.target.value)}
                    />
                  </td>
                  <td>
                    {item.line_kind === "residual" && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          p.setForm((current) => ({
                            ...current,
                            distribution: current.distribution.filter(
                              (_, x) => x !== i,
                            ),
                          }))
                        }
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
                {item.payments.map((entry, j) => (
                  <tr className="cis-payment-row" key={entry.id}>
                    <td colSpan="9">
                      <div className="cis-split">
                        <DateInput
                          required
                          value={entry.payment_date}
                          onChange={(v) => p.updatePay(i, j, "payment_date", v)}
                        />
                        <Amount
                          required
                          value={entry.amount_aed}
                          onChange={(v) => p.updatePay(i, j, "amount_aed", v)}
                        />
                        <select
                          className="form-control"
                          value={entry.payment_mode}
                          onChange={(e) =>
                            p.updatePay(i, j, "payment_mode", e.target.value)
                          }
                        >
                          <option value="">Mode</option>
                          {MODES.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                        <input
                          className="form-control"
                          placeholder="Instrument #"
                          value={entry.instrument_no}
                          onChange={(e) =>
                            p.updatePay(i, j, "instrument_no", e.target.value)
                          }
                        />
                        <input
                          className="form-control"
                          placeholder="Notes"
                          value={entry.notes}
                          onChange={(e) =>
                            p.updatePay(i, j, "notes", e.target.value)
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => p.removePay(i, j)}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="form-hint">
        Paid across all payment splits: {money(p.allPaid)}. Percentage and
        payable calculate each other.
      </p>
    </Section>
  );
}
function Accounts(p) {
  const netAgent = round(
      p.received -
        num(p.form.deductions_aed) +
        num(p.form.additional_payment_aed),
    ),
    afterDeduction = round(
      p.gross - num(p.form.deductions_aed) + num(p.form.additional_payment_aed),
    );
  return (
    <Section number="6" title="Accounts tracking — for office use">
      <div className="cis-account-summary">
        <div>
          <span>Receivable — from developer / client</span>
          <b>Expected (gross + VAT): {money(p.total)}</b>
          <small>
            Received so far {money(p.received)} · Pending to receive{" "}
            {money(Math.max(p.total - p.received, 0))}
          </small>
        </div>
        <div>
          <span>Payable — to agents / external parties</span>
          <b>
            Expected (all rows except Company Share): {money(p.expectedPayable)}
          </b>
          <small>
            Paid so far {money(p.allPaid)} · Pending to pay{" "}
            {money(Math.max(p.expectedPayable - p.allPaid, 0))}
          </small>
        </div>
      </div>
      <Field label="Transaction status">
        <select
          className="form-control"
          value={p.form.tracking_status}
          onChange={(event) => p.set("tracking_status", event.target.value)}
        >
          <option value="">Select</option>
          {STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </Field>
      <div className="form-row-3 cis-account-fields">
        <Field label="Invoice no">
          <input
            className="form-control"
            value={p.form.invoice_no}
            onChange={(event) => p.set("invoice_no", event.target.value)}
          />
        </Field>
        <Field label="Invoice sent to developer">
          <DateInput
            value={p.form.invoice_sent_date}
            onChange={(value) => p.set("invoice_sent_date", value)}
          />
        </Field>
        <Field label="Commission paid to agent (date)">
          <DateInput
            value={p.form.commission_paid_date}
            onChange={(value) => p.set("commission_paid_date", value)}
          />
        </Field>
        <Field label="Payment mode">
          <select
            className="form-control"
            value={p.form.payment_mode_paid || ""}
            onChange={(event) => p.set("payment_mode_paid", event.target.value)}
          >
            <option value="">Select</option>
            {MODES.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </Field>
        <Field label="Amount paid (AED)">
          <Amount
            readOnly
            value={
              p.form.finance_amount_paid_override_aed === ""
                ? p.allPaid
                : p.form.finance_amount_paid_override_aed
            }
          />
        </Field>
        <Field label="Paid to client / external agent (date)">
          <DateInput
            value={p.form.paid_client_ext_date}
            onChange={(value) => p.set("paid_client_ext_date", value)}
          />
        </Field>
        <Field label="Paid to client / external agent (AED)">
          <Amount
            value={p.form.paid_client_ext_amount}
            onChange={(value) => p.set("paid_client_ext_amount", value)}
          />
        </Field>
        <Field label="Deductions (AED)">
          <Amount
            value={p.form.deductions_aed}
            onChange={(value) => p.set("deductions_aed", value)}
          />
        </Field>
        <Field label="Additional payment (AED)">
          <Amount
            value={p.form.additional_payment_aed}
            onChange={(value) => p.set("additional_payment_aed", value)}
          />
        </Field>
        <Field label="Net agent payable (AED)">
          <Amount readOnly value={netAgent} />
        </Field>
        <Field label="Total commission after deduction (AED)">
          <Amount readOnly value={afterDeduction} />
        </Field>
        <Field label="Finance paid override">
          <Amount
            value={p.form.finance_amount_paid_override_aed}
            onChange={(value) =>
              p.set("finance_amount_paid_override_aed", value)
            }
          />
        </Field>
        <Field label="Override reason">
          <input
            className="form-control"
            value={p.form.finance_override_reason}
            onChange={(event) =>
              p.set("finance_override_reason", event.target.value)
            }
          />
        </Field>
      </div>
      <div className="cis-subhead">
        <h3>Commission receipts — amount, date, mode and instrument</h3>
        <button type="button" className="btn ghost" onClick={p.addReceipt}>
          + Add receipt
        </button>
      </div>
      {p.form.receipts.length ? (
        p.form.receipts.map((item, index) => (
          <div className="cis-split" key={item.id}>
            <DateInput
              required
              value={item.received_date}
              onChange={(value) =>
                p.updateReceipt(index, "received_date", value)
              }
            />
            <Amount
              required
              value={item.amount_aed}
              onChange={(value) => p.updateReceipt(index, "amount_aed", value)}
            />
            <select
              className="form-control"
              value={item.receive_mode}
              onChange={(event) =>
                p.updateReceipt(index, "receive_mode", event.target.value)
              }
            >
              <option value="">Mode</option>
              {MODES.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
            <input
              className="form-control"
              placeholder="Instrument #"
              value={item.instrument_no}
              onChange={(event) =>
                p.updateReceipt(index, "instrument_no", event.target.value)
              }
            />
            <input
              className="form-control"
              placeholder="Remark"
              value={item.remarks}
              onChange={(event) =>
                p.updateReceipt(index, "remarks", event.target.value)
              }
            />
            <button
              type="button"
              className="btn"
              onClick={() =>
                p.set(
                  "receipts",
                  p.form.receipts.filter((_, rowIndex) => rowIndex !== index),
                )
              }
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <div className="cis-empty">No receipts entered.</div>
      )}
      <Field label="Remarks">
        <textarea
          className="form-control"
          rows="2"
          value={p.form.remarks}
          onChange={(event) => p.set("remarks", event.target.value)}
        />
      </Field>
    </Section>
  );
}
function LegacyAccounts(p) {
  return (
    <Section number="6" title="Accounts tracking — office use">
      <div className="cis-account-summary">
        <div>
          <span>Expected receivable</span>
          <b>{money(p.total)}</b>
          <small>
            Received {money(p.received)} · Pending{" "}
            {money(Math.max(p.total - p.received, 0))}
          </small>
        </div>
        <div>
          <span>Expected payable</span>
          <b>{money(p.expectedPayable)}</b>
          <small>
            Paid {money(p.allPaid)} · Pending{" "}
            {money(Math.max(p.expectedPayable - p.allPaid, 0))}
          </small>
        </div>
      </div>
      <div className="form-row-3">
        <Field label="Transaction status">
          <select
            className="form-control"
            value={p.form.tracking_status}
            onChange={(e) => p.set("tracking_status", e.target.value)}
          >
            <option value="">Select</option>
            {STATUSES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Invoice no">
          <input
            className="form-control"
            value={p.form.invoice_no}
            onChange={(e) => p.set("invoice_no", e.target.value)}
          />
        </Field>
        <Field label="Invoice sent date">
          <DateInput
            value={p.form.invoice_sent_date}
            onChange={(v) => p.set("invoice_sent_date", v)}
          />
        </Field>
      </div>
      <div className="cis-subhead">
        <h3>Commission receipts</h3>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={p.addReceipt}
        >
          + Add receipt
        </button>
      </div>
      {p.form.receipts.length ? (
        p.form.receipts.map((item, i) => (
          <div className="cis-split" key={item.id}>
            <DateInput
              required
              value={item.received_date}
              onChange={(v) => p.updateReceipt(i, "received_date", v)}
            />
            <Amount
              required
              value={item.amount_aed}
              onChange={(v) => p.updateReceipt(i, "amount_aed", v)}
            />
            <select
              className="form-control"
              value={item.receive_mode}
              onChange={(e) =>
                p.updateReceipt(i, "receive_mode", e.target.value)
              }
            >
              <option value="">Mode</option>
              {MODES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <input
              className="form-control"
              placeholder="Instrument #"
              value={item.instrument_no}
              onChange={(e) =>
                p.updateReceipt(i, "instrument_no", e.target.value)
              }
            />
            <input
              className="form-control"
              placeholder="Remark"
              value={item.remarks}
              onChange={(e) => p.updateReceipt(i, "remarks", e.target.value)}
            />
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() =>
                p.set(
                  "receipts",
                  p.form.receipts.filter((_, x) => x !== i),
                )
              }
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <div className="cis-empty">No receipts entered.</div>
      )}
      <div className="form-row-3 cis-account-fields">
        <Field label="Deductions (AED)">
          <Amount
            value={p.form.deductions_aed}
            onChange={(v) => p.set("deductions_aed", v)}
          />
        </Field>
        <Field label="Additional payment (AED)">
          <Amount
            value={p.form.additional_payment_aed}
            onChange={(v) => p.set("additional_payment_aed", v)}
          />
        </Field>
        <Field label="Calculated paid (AED)">
          <Amount readOnly value={p.allPaid} />
        </Field>
        <Field label="Finance paid override">
          <Amount
            value={p.form.finance_amount_paid_override_aed}
            onChange={(v) => p.set("finance_amount_paid_override_aed", v)}
          />
        </Field>
        <Field label="Override reason">
          <input
            className="form-control"
            value={p.form.finance_override_reason}
            onChange={(e) => p.set("finance_override_reason", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Remarks">
        <textarea
          className="form-control"
          value={p.form.remarks}
          onChange={(e) => p.set("remarks", e.target.value)}
        />
      </Field>
    </Section>
  );
}
function Setup(p) {
  const deletedRows = p.rows.filter((row) => row.deleted_at);
  const [backupStatus, setBackupStatus] = useState("");
  const exportBackup = async () => {
    const XLSX = await import("xlsx");
    const rows = p.rows.map((row) => {
      const flat = {
        ...row,
        company:
          p.companies.find((company) => company.id === row.company_id)?.name ||
          "",
        distribution_json: JSON.stringify(
          row.commission_distribution_lines || [],
        ),
        documents_json: JSON.stringify(row.commission_sheet_documents || []),
        receipts_json: JSON.stringify(row.commission_receipts || []),
      };
      delete flat.commission_distribution_lines;
      delete flat.commission_sheet_documents;
      delete flat.commission_receipts;
      return flat;
    });
    const workbook = XLSX.utils.book_new(),
      worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, `commission-transactions-backup-${today()}.xlsx`);
    setBackupStatus(
      `${rows.length} transaction${rows.length === 1 ? "" : "s"} exported.`,
    );
  };
  const importBackup = async (file) => {
    if (!file) return;
    setBackupStatus("Importing workbook…");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), {
          cellDates: false,
        }),
        worksheet = workbook.Sheets[workbook.SheetNames[0]],
        imported = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
        });
      let count = 0;
      for (const source of imported) {
        const company = p.companies.find(
          (item) =>
            item.id === source.company_id || item.name === source.company,
        );
        if (
          !company ||
          !source.client_name ||
          !source.unit_no ||
          !source.deal_type
        )
          continue;
        let formRef = source.form_ref,
          existing = p.rows.find((row) => row.form_ref === formRef),
          sheetId = existing?.id;
        if (!formRef) {
          const reference = await supabase.rpc("next_commission_sheet_ref", {
            p_company_id: company.id,
          });
          if (reference.error) throw reference.error;
          formRef = reference.data;
        }
        const allowed = [
          "transaction_date",
          "client_name",
          "client_contact",
          "client_id_number",
          "client_id_expiry",
          "building_project",
          "developer",
          "developer_bdm_name",
          "developer_bdm_email",
          "developer_bdm_contact",
          "unit_no",
          "unit_type",
          "bedrooms",
          "unit_value_aed",
          "agent_name",
          "agent_team",
          "deal_type",
          "lead_source",
          "lead_source_other",
          "commission_pct",
          "gross_commission_aed",
          "vat_amount_aed",
          "total_payable_aed",
          "tracking_status",
          "invoice_no",
          "invoice_sent_date",
          "commission_received_date",
          "receive_mode",
          "amount_received_aed",
          "commission_paid_date",
          "payment_mode_paid",
          "calculated_amount_paid_aed",
          "finance_amount_paid_override_aed",
          "finance_override_reason",
          "paid_client_ext_date",
          "paid_client_ext_amount",
          "deductions_aed",
          "additional_payment_aed",
          "net_agent_payable_aed",
          "total_after_deduction_aed",
          "remarks",
          "prepared_by",
          "manager",
          "accounts",
          "deleted_at",
        ];
        const payload = {
          form_ref: formRef,
          company_id: company.id,
          updated_by: p.user.id,
        };
        allowed.forEach((key) => {
          if (source[key] !== "" && source[key] != null)
            payload[key] = source[key];
        });
        payload.transaction_date ||= today();
        payload.gross_commission_aed = num(payload.gross_commission_aed);
        payload.vat_amount_aed =
          source.vat_amount_aed === ""
            ? round(payload.gross_commission_aed * 0.05)
            : num(source.vat_amount_aed);
        payload.total_payable_aed =
          source.total_payable_aed === ""
            ? round(payload.gross_commission_aed + payload.vat_amount_aed)
            : num(source.total_payable_aed);
        if (sheetId) {
          const result = await supabase
            .from("commission_sheets")
            .update(payload)
            .eq("id", sheetId);
          if (result.error) throw result.error;
        } else {
          const result = await supabase
            .from("commission_sheets")
            .insert({
              ...payload,
              created_by: p.user.id,
            })
            .select("id")
            .single();
          if (result.error) throw result.error;
          sheetId = result.data.id;
        }
        const restoreChildren = async (
          column,
          table,
          foreignKey,
          transform,
        ) => {
          if (!source[column]) return;
          let values;
          try {
            values = JSON.parse(source[column]);
          } catch {
            return;
          }
          await supabase.from(table).delete().eq(foreignKey, sheetId);
          const prepared = values.map((value, index) =>
            transform(value, index),
          );
          if (prepared.length) {
            const result = await supabase.from(table).insert(prepared);
            if (result.error) throw result.error;
          }
        };
        await restoreChildren(
          "documents_json",
          "commission_sheet_documents",
          "commission_sheet_id",
          (value) => ({
            commission_sheet_id: sheetId,
            document_code: value.document_code,
            document_label: value.document_label,
            is_selected: !!value.is_selected,
            other_description: value.other_description || null,
            local_file_name: value.local_file_name || null,
            local_folder_label: value.local_folder_label || null,
          }),
        );
        await restoreChildren(
          "receipts_json",
          "commission_receipts",
          "commission_sheet_id",
          (value) => ({
            commission_sheet_id: sheetId,
            received_date: value.received_date || today(),
            amount_aed: num(value.amount_aed),
            receive_mode: value.receive_mode || null,
            instrument_no: value.instrument_no || null,
            remarks: value.remarks || null,
            created_by: p.user.id,
          }),
        );
        if (source.distribution_json) {
          let lines = [];
          try {
            lines = JSON.parse(source.distribution_json);
          } catch {}
          await supabase
            .from("commission_distribution_lines")
            .delete()
            .eq("commission_sheet_id", sheetId);
          for (let index = 0; index < lines.length; index++) {
            const value = lines[index],
              lineId = id(),
              lineResult = await supabase
                .from("commission_distribution_lines")
                .insert({
                  id: lineId,
                  commission_sheet_id: sheetId,
                  line_kind: value.line_kind,
                  type_label: value.type_label || null,
                  sort_order: index,
                  party: value.party || null,
                  recipient_name: value.recipient_name || null,
                  pct_of_base: num(value.pct_of_base) || null,
                  payable_aed: num(value.payable_aed),
                  paid_aed: num(value.paid_aed),
                  payment_mode: value.payment_mode || null,
                  notes: value.notes || null,
                });
            if (lineResult.error) throw lineResult.error;
            const payments = (
              value.commission_distribution_payments ||
              value.payments ||
              []
            ).map((entry) => ({
              distribution_line_id: lineId,
              payment_date: entry.payment_date || today(),
              amount_aed: num(entry.amount_aed),
              payment_mode: entry.payment_mode || null,
              instrument_no: entry.instrument_no || null,
              notes: entry.notes || null,
              created_by: p.user.id,
            }));
            if (payments.length) {
              const paymentResult = await supabase
                .from("commission_distribution_payments")
                .insert(payments);
              if (paymentResult.error) throw paymentResult.error;
            }
          }
        }
        count++;
      }
      await p.load();
      setBackupStatus(
        `${count} transaction${count === 1 ? "" : "s"} imported or updated.`,
      );
    } catch (importError) {
      setBackupStatus(
        `Import failed: ${importError.message || "Invalid workbook"}`,
      );
    }
  };
  return (
    <main className="cis-wrap cis-setup">
      <h2 className="cis-dash-title">Setup</h2>
      {p.error && <div className="alert alert-error">{p.error}</div>}
      {p.notice && <div className="alert alert-success">{p.notice}</div>}
      <Section title="Commission letterhead">
        <p className="form-hint strong">
          Upload your company letterhead (image — PNG/JPG). Once set, it
          replaces the plain “Commission Sheet” title at the top of the printed
          / PDF sheet.
        </p>
        {p.letterhead && (
          <img
            className="cis-letterhead"
            src={p.letterhead.dataUrl}
            alt="Letterhead"
          />
        )}
        <div className="cis-inline-actions">
          <input
            className="form-control"
            type="file"
            accept="image/*"
            onChange={(event) => p.chooseLetterhead(event.target.files?.[0])}
          />
        </div>
        <p className="form-hint">
          {p.letterhead
            ? `Letterhead set: ${p.letterhead.filename || "uploaded image"}`
            : "No letterhead uploaded — the printed sheet will use the default title."}
        </p>
      </Section>
      <Section title="Google Drive attachments">
        <p className="form-hint strong">
          {p.driveTokenValid
            ? "Connected. Attachments will be saved to your Google Drive."
            : "Not connected."}
        </p>
        <div className="cis-inline-actions">
          <button className="btn primary" onClick={p.connectGoogleDrive}>
            {p.driveTokenValid ? "Reconnect" : "Connect Google Drive"}
          </button>
        </div>
        <p className="form-hint">
          Every transaction gets its own folder inside a "Commission Sheets
          Attachments" folder in your Google Drive. Use the "Share
          attachments" button on a saved transaction to get a link you can
          send to anyone — they'll be able to view, add, and edit files in
          that folder, so only share it with people you trust.
        </p>
        <p className="form-hint">
          The connection lasts about an hour at a time — you'll be asked to
          reconnect after that, or whenever it expires mid-session.
        </p>
      </Section>
      <Section title="Transaction records storage">
        <p className="form-hint strong">
          Transaction records are stored in the project Supabase database.
        </p>
        <p className="form-hint">
          Use the Excel backup below for a portable record backup.
        </p>
      </Section>
      <Section title="Recycle Bin — recall & restore deleted transactions">
        <p className="form-hint strong">
          Deleting a transaction moves it here instead of erasing it. SuperAdmin
          can restore or permanently delete it.
        </p>
        {deletedRows.length ? (
          <div className="cis-dash-table">
            <table>
              <thead>
                <tr>
                  <th>Form ref</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Unit no</th>
                  <th>Total payable</th>
                  <th>Deleted at</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deletedRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.form_ref}</td>
                    <td>{dateText(row.transaction_date)}</td>
                    <td>{row.client_name || "—"}</td>
                    <td>{row.unit_no || "—"}</td>
                    <td>{money(row.total_payable_aed)}</td>
                    <td>
                      {row.deleted_at
                        ? new Date(row.deleted_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="cis-actions">
                      {p.isSuper && (
                        <>
                          <button onClick={() => p.restore(row)}>
                            Restore
                          </button>
                          <button
                            className="danger"
                            onClick={() => p.purge(row)}
                          >
                            Delete permanently
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cis-empty">
            Recycle Bin is empty — deleted transactions will appear here.
          </div>
        )}
      </Section>
      <Section title="Backup & restore (Excel)">
        <p className="form-hint strong">
          Export every transaction (active and deleted) to an Excel workbook
          for backup, or restore and merge a previously exported workbook.
        </p>
        <div className="cis-inline-actions">
          <button className="btn primary" onClick={exportBackup}>
            Export to Excel (.xlsx)
          </button>
          <label className="btn">
            Import from Excel (.xlsx)
            <input
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(event) => importBackup(event.target.files?.[0])}
            />
          </label>
        </div>
        {backupStatus && <p className="form-hint">{backupStatus}</p>}
      </Section>
      {p.isSuper && (
        <>
          <Section title="Required document checklist">
            <div className="form-row-3">
              <Field label="Deal type">
                <select
                  className="form-control"
                  value={p.newDoc.deal_type}
                  onChange={(event) =>
                    p.setNewDoc((current) => ({
                      ...current,
                      deal_type: event.target.value,
                    }))
                  }
                >
                  {Object.entries(DEALS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Document name">
                <input
                  className="form-control"
                  value={p.newDoc.document_label}
                  onChange={(event) =>
                    p.setNewDoc((current) => ({
                      ...current,
                      document_label: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Required">
                <label>
                  <input
                    type="checkbox"
                    checked={p.newDoc.is_required}
                    onChange={(event) =>
                      p.setNewDoc((current) => ({
                        ...current,
                        is_required: event.target.checked,
                      }))
                    }
                  />{" "}
                  Mandatory
                </label>
              </Field>
            </div>
            <button className="btn primary" onClick={p.addDoc}>
              Add document
            </button>
            <div className="cis-config-list">
              {p.templates.map((item) => (
                <div key={item.id}>
                  <span>
                    {DEALS[item.deal_type]} · {item.document_label}
                    {item.is_required ? " · Required" : ""}
                  </span>
                  <button className="btn" onClick={() => p.removeDoc(item)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Distribution Type and Party lists">
            <div className="form-row-3">
              <Field label="List">
                <select
                  className="form-control"
                  value={p.newOption.option_kind}
                  onChange={(event) =>
                    p.setNewOption((current) => ({
                      ...current,
                      option_kind: event.target.value,
                    }))
                  }
                >
                  <option value="type">Type</option>
                  <option value="party">Party</option>
                </select>
              </Field>
              <Field label="New option">
                <input
                  className="form-control"
                  value={p.newOption.label}
                  onChange={(event) =>
                    p.setNewOption((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label=" ">
                <button className="btn primary" onClick={p.addOption}>
                  Add option
                </button>
              </Field>
            </div>
            <div className="cis-config-list">
              {p.options.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.option_kind} · {item.label}
                  </span>
                  <button className="btn" onClick={() => p.removeOption(item)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}
function LegacySetup(p) {
  return (
    <div className="cis-page">
      <div className="page-header cis-page-head">
        <div>
          <h1>Commission Input Sheet Setup</h1>
          <p>Local storage, print letterhead and configurable lists.</p>
        </div>
        <button className="btn btn-outline" onClick={p.onBack}>
          Back
        </button>
      </div>
      {p.error && <div className="alert alert-error">{p.error}</div>}
      {p.notice && <div className="alert alert-success">{p.notice}</div>}
      <Section title="Documents storage location">
        <div className={`cis-folder ${p.folder ? "ok" : "missing"}`}>
          <b>{p.folder ? "Folder mapped" : "Folder not set"}</b>
          <span>
            {p.folder?.name || "Choose Downloads now; switch to N: when ready."}
          </span>
        </div>
        <button className="btn btn-primary" onClick={p.chooseFolder}>
          Choose documents folder…
        </button>
      </Section>
      <Section title="Commission letterhead">
        <input
          className="form-control"
          type="file"
          accept="image/*"
          onChange={(e) => p.chooseLetterhead(e.target.files?.[0])}
        />
        {p.letterhead && (
          <img
            className="cis-letterhead"
            src={p.letterhead.dataUrl}
            alt="Letterhead"
          />
        )}
      </Section>
      {p.isSuper && (
        <>
          <Section title="Required document checklist">
            <div className="form-row-3">
              <Field label="Deal type">
                <select
                  className="form-control"
                  value={p.newDoc.deal_type}
                  onChange={(e) =>
                    p.setNewDoc((c) => ({
                      ...c,
                      deal_type: e.target.value,
                    }))
                  }
                >
                  {Object.entries(DEALS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Document name">
                <input
                  className="form-control"
                  value={p.newDoc.document_label}
                  onChange={(e) =>
                    p.setNewDoc((c) => ({
                      ...c,
                      document_label: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Required">
                <label>
                  <input
                    type="checkbox"
                    checked={p.newDoc.is_required}
                    onChange={(e) =>
                      p.setNewDoc((c) => ({
                        ...c,
                        is_required: e.target.checked,
                      }))
                    }
                  />{" "}
                  Mandatory
                </label>
              </Field>
            </div>
            <button className="btn btn-primary" onClick={p.addDoc}>
              Add document
            </button>
            <div className="cis-config-list">
              {p.templates.map((item) => (
                <div key={item.id}>
                  <span>
                    {DEALS[item.deal_type]} · {item.document_label}
                    {item.is_required ? " \xB7 Required" : ""}
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => p.removeDoc(item)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Distribution Type and Party lists">
            <div className="form-row-3">
              <Field label="List">
                <select
                  className="form-control"
                  value={p.newOption.option_kind}
                  onChange={(e) =>
                    p.setNewOption((c) => ({
                      ...c,
                      option_kind: e.target.value,
                    }))
                  }
                >
                  <option value="type">Type</option>
                  <option value="party">Party</option>
                </select>
              </Field>
              <Field label="New option">
                <input
                  className="form-control"
                  value={p.newOption.label}
                  onChange={(e) =>
                    p.setNewOption((c) => ({
                      ...c,
                      label: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label=" ">
                <button className="btn btn-primary" onClick={p.addOption}>
                  Add option
                </button>
              </Field>
            </div>
            <div className="cis-config-list">
              {p.options.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.option_kind} · {item.label}
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => p.removeOption(item)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
export { CommissionSheets as default };
