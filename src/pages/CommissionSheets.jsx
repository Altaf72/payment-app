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
const today = () => /* @__PURE__ */ new Date().toISOString().slice(0, 10),
  id = () => crypto.randomUUID();
const num = (value) => Number(String(value ?? "").replaceAll(",", "")) || 0,
  round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
function Amount({ value, onChange, readOnly = false, required = false }) {
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
      onBlur={() => setFocus(false)}
      onKeyDown={(e) => {
        if (["ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
      }}
      onChange={(e) => onChange?.(e.target.value.replace(/[^0-9.-]/g, ""))}
    />
  );
}
function DateInput({ value, onChange, required = false }) {
  const ref = useRef(null);
  return (
    <div className="cis-date">
      <input
        className="form-control"
        readOnly
        required={required}
        value={value ? dateText(value) : ""}
        placeholder="dd-MMM-yyyy"
        onClick={() => ref.current?.showPicker?.()}
      />
      <button type="button" onClick={() => ref.current?.showPicker?.()}>
        ▣
      </button>
      <input
        ref={ref}
        className="cis-native-date"
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
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
    [folder, setFolder] = useState(null),
    [letterhead, setLetterhead] = useState(null);
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
  const residual = gross;
  const expectedPayable = form.distribution
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
        setFolder(await setting("folder"));
        setLetterhead(await setting("letterhead"));
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
        .filter((item) => item.line_kind === "residual")
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
        unit_type: recent.unit_type || "",
      }),
    }));
  }
  function updateLine(index, key, value) {
    setForm((current) => ({
      ...current,
      distribution: current.distribution.map((item, i) => {
        if (i !== index) return item;
        const next = {
            ...item,
            [key]: value,
          },
          base = num(current.gross_commission_aed);
        if (key === "pct_of_base")
          next.payable_aed = round((base * num(value)) / 100);
        if (key === "payable_aed" && base)
          next.pct_of_base = round((num(value) / base) * 100);
        return next;
      }),
    }));
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
  async function chooseFolder() {
    if (!window.showDirectoryPicker)
      return setError("Folder selection requires Edge or Chrome.");
    try {
      const handle = await window.showDirectoryPicker({
        mode: "readwrite",
      });
      await saveSetting("folder", handle);
      setFolder(handle);
      setNotice(`Documents folder mapped: ${handle.name}`);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
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
    const entries = Object.entries(files).filter(([, file]) => file);
    if (!entries.length) return {};
    if (!folder)
      throw new Error(
        "Choose a documents folder in Setup before saving selected attachments.",
      );
    if (
      (await folder.requestPermission({
        mode: "readwrite",
      })) !== "granted"
    )
      throw new Error("Folder write permission was not granted.");
    const dir = await folder.getDirectoryHandle(
        ref.replace(/[^a-z0-9_-]/gi, "_"),
        {
          create: true,
        },
      ),
      result = {};
    for (const [code, file] of entries) {
      const handle = await dir.getFileHandle(
          `${code.replaceAll(".", "_")}__${file.name}`,
          {
            create: true,
          },
        ),
        writer = await handle.createWritable();
      await writer.write(file);
      await writer.close();
      result[code] = {
        local_file_name: file.name,
        local_folder_label: `${folder.name}/${dir.name}`,
      };
    }
    return result;
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
        doc.is_selected && !files[doc.document_code] && !doc.local_file_name,
    );
    if (attachments.length)
      return setError(
        `Attachment required for: ${attachments.map((doc) => doc.document_label).join(", ")}.`,
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
      for (let i = 0; i < form.distribution.length; i++) {
        const item = form.distribution[i],
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
            payable_aed: num(item.payable_aed),
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
      distribution = (
        row.commission_distribution_lines ||
        row.distribution ||
        []
      ).filter((item) => item.line_kind === "residual"),
      documents = row.commission_sheet_documents || row.documents || [],
      receipts = row.commission_receipts || row.receipts || [];
    const checked = (value) => (value ? "☑" : "☐"),
      cell = (label, value) =>
        `<div class="ps-cell"><span class="l">${esc(label)}</span><span class="v">${value ?? "—"}</span></div>`;
    const docRows =
      documents
        .map(
          (doc) =>
            `<div>${checked(doc.is_selected)} ${esc(doc.document_label)}${doc.local_file_name ? ` — <em>${esc(doc.local_file_name)}</em>` : ""}</div>`,
        )
        .join("") || "<div>—</div>";
    const distRows =
      distribution
        .map((item) => {
          const itemPaid = item.paid_aed ?? paid(item),
            mode =
              item.payment_mode ||
              item.commission_distribution_payments?.at(-1)?.payment_mode ||
              item.payments?.at(-1)?.payment_mode ||
              "—";
          return `<tr><td>${esc(item.type_label || item.party || "—")}</td><td>${esc(item.recipient_name || "—")}</td><td>${money(item.payable_aed)}${num(item.pct_of_base) ? ` (${fmt(item.pct_of_base)}%)` : ""}</td><td>${money(itemPaid)}</td><td>${money(num(item.payable_aed) - num(itemPaid))}</td><td>${esc(mode)}</td><td>&nbsp;</td></tr>`;
        })
        .join("") || `<tr><td colspan="7">—</td></tr>`;
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
      )}</div></div></div><div class="ps-section"><div class="ps-section-head">3. COMMISSION SUMMARY</div><div class="ps-row">${cell("Gross Commission (AED)", `${money(row.gross_commission_aed)}${num(row.commission_pct) ? ` (${fmt(row.commission_pct)}%)` : ""}`)}${cell("VAT 5%", money(row.vat_amount_aed ?? round(num(row.gross_commission_aed) * 0.05)))}${cell("Total Payable (AED)", money(row.total_payable_aed ?? round(num(row.gross_commission_aed) * 1.05)))}</div></div><div class="ps-section"><div class="ps-section-head">4. CLIENT DOCUMENTS REQUIRED</div><div class="ps-doc-cols"><div class="ps-doc-col"><h4>${esc(DEALS[row.deal_type] || "Documents")}</h4>${docRows}</div></div></div><div class="ps-section"><div class="ps-section-head">5. COMMISSION DISTRIBUTION</div><div class="ps-section-body cis-print-note">Residual after off-the-top items: ${money(Math.max(num(row.gross_commission_aed) - distribution.filter((item) => item.line_kind !== "residual").reduce((sum, item) => sum + num(item.payable_aed), 0), 0))}</div><table class="ps-dist-table"><tr><th>Party</th><th>Name / Company</th><th>Payable Amount (AED)</th><th>Paid Amount (AED)</th><th>Balance (AED)</th><th>Payment Mode</th><th>Signature</th></tr>${distRows}</table></div><div class="ps-section"><div class="ps-section-head">6. ACCOUNTS TRACKING (FOR OFFICE USE)</div><div class="ps-row">${cell("Status", esc(row.tracking_status || "—"))}${cell("Invoice No", esc(row.invoice_no || "—"))}${cell("Invoice Sent (Date)", dateText(row.invoice_sent_date))}</div><div class="ps-row">${cell("Commission Received", dateText(receivedDate))}${cell("Receive Mode", esc(receivedMode || "—"))}${cell("Amount Received", money(receivedTotal))}</div><div class="ps-row">${cell("Commission Paid to Agent", dateText(row.commission_paid_date))}${cell("Payment Mode", esc(row.payment_mode_paid || "—"))}${cell("Amount Paid", money(row.finance_amount_paid_override_aed ?? row.calculated_amount_paid_aed))}</div><div class="ps-row">${cell("Paid to Client/Ext. Agent", dateText(row.paid_client_ext_date))}${cell("Paid to Client/Ext. Agent (AED)", money(row.paid_client_ext_amount))}${cell("Deductions (AED)", money(row.deductions_aed))}</div><div class="ps-row">${cell("Additional Payment (AED)", money(row.additional_payment_aed))}${cell("Net Agent Payable (AED)", money(row.net_agent_payable_aed))}${cell("Total Comm. After Deduction", money(row.total_after_deduction_aed))}</div>${row.remarks ? `<div class="ps-section-body"><strong>Remarks:</strong> ${esc(row.remarks)}</div>` : ""}</div><div class="ps-section"><div class="ps-section-head">7. APPROVALS</div><div class="ps-approvals"><div class="a"><div class="name">${esc(row.prepared_by || "&nbsp;")}</div><div class="line">Prepared By</div></div><div class="a"><div class="name">${esc(row.manager || "&nbsp;")}</div><div class="line">Manager</div></div><div class="a"><div class="name">${esc(row.accounts || "&nbsp;")}</div><div class="line">Accounts</div></div></div></div></div>`;
    const popup = window.open(
      "",
      "_blank",
      "width=980,height=1040,scrollbars=yes,resizable=yes",
    );
    if (!popup)
      return setError(
        "Pop-up blocked — allow pop-ups for this page to use View.",
      );
    const popupCss = `body{margin:0;background:#f0f1ec;font-family:Arial,Helvetica,sans-serif}.vp-toolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#16232e;color:#fff}.vp-actions{display:flex;gap:8px}.vp-toolbar button{padding:7px 16px;border:0;border-radius:3px;background:#a9782e;color:#fff;cursor:pointer}.vp-toolbar .danger{background:#b23b3b}.vp-wrap{max-width:880px;margin:18px auto;padding:0 16px 40px}.ps-page{background:#fff;color:#111;font-size:11px}.ps-letterhead{display:block;width:100%;max-height:130px;object-fit:contain;margin:0 0 6px}.ps-title{text-align:center;font-size:18px;font-weight:700;letter-spacing:.05em;border:2px solid #111;padding:8px}.ps-metarow{display:flex;justify-content:space-between;border:1px solid #111;border-top:0;padding:5px 8px}.ps-section{border:1px solid #111;border-top:0}.ps-section-head{padding:4px 8px;background:#111;color:#fff;font-weight:700;letter-spacing:.03em}.ps-section-body{padding:7px 9px}.ps-row{display:flex;border-bottom:1px solid #ccc}.ps-row:last-child{border-bottom:0}.ps-cell{display:flex;flex:1;align-items:baseline;gap:4px;min-width:0;padding:3px 6px;border-right:1px solid #ccc}.ps-cell:last-child{border-right:0}.ps-cell .l{flex:0 0 104px;color:#555;font-size:8.5px;line-height:1.25;text-transform:uppercase}.ps-cell .l:after{content:':'}.ps-cell .v{overflow:hidden;flex:1;font-size:10.5px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.ps-checkline{padding:3px 0}.ps-doc-cols{display:flex}.ps-doc-col{flex:1;padding:4px 8px}.ps-doc-col h4{margin:0 0 5px;font-size:10px;text-transform:uppercase}.ps-doc-col div{margin-bottom:3px;font-size:10.5px}.ps-dist-table{width:100%;border-collapse:collapse;font-size:10.5px}.ps-dist-table th,.ps-dist-table td{padding:5px 6px;border:1px solid #ccc;text-align:left}.cis-print-note{padding-bottom:0;color:#555;font-size:10px}.ps-approvals{display:flex}.ps-approvals .a{flex:1;padding:10px 8px;border-right:1px solid #ccc;text-align:center}.ps-approvals .a:last-child{border:0}.ps-approvals .name{min-height:14px;margin-bottom:18px;font-weight:600}.ps-approvals .line{padding-top:3px;border-top:1px solid #111;color:#555;font-size:9px;text-transform:uppercase}@media print{.vp-toolbar{display:none}.vp-wrap{max-width:none;margin:0;padding:0}body{background:#fff}}`;
    popup.document.write(
      `<!doctype html><html><head><meta charset="UTF-8"><title>${esc(row.form_ref || "Commission Sheet")}${row.client_name ? ` — ${esc(row.client_name)}` : ""}</title><style>${popupCss}</style></head><body><div class="vp-toolbar"><strong>${esc(row.form_ref || "Commission Sheet")}${row.client_name ? ` — ${esc(row.client_name)}` : ""}</strong><div class="vp-actions">${canMake ? `<button id="edit">Edit</button>` : ""}<button id="print">Print / Save PDF</button>${isSuper ? `<button id="delete" class="danger">Delete</button>` : ""}</div></div><div class="vp-wrap">${printHtml}</div></body></html>`,
    );
    popup.document.close();
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
  if (view === "setup")
    return (
      <CommissionChrome active="setup" {...chrome}>
        <Setup
          {...{
            folder,
            letterhead,
            templates,
            options,
            newDoc,
            setNewDoc,
            newOption,
            setNewOption,
            chooseFolder,
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
          }}
        />
      </CommissionChrome>
    );
  if (view === "editor")
    return (
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
            updateLine,
            addPay,
            updatePay,
            removePay,
            addReceipt,
            updateReceipt,
            setup,
            save,
            folder,
            print,
            fresh,
          }}
          onCancel={() => setView("dashboard")}
        />
      </CommissionChrome>
    );
  return (
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
        }}
      />
    </CommissionChrome>
  );
}
function Dashboard(p) {
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
              <th />
            </tr>
          </thead>
          <tbody>
            {p.loading ? (
              <tr>
                <td colSpan="11">Loading…</td>
              </tr>
            ) : p.filtered.length ? (
              p.filtered.map((row) => (
                <tr key={row.id}>
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
                      <button type="button" onClick={() => p.softDelete(row)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="11" className="cis-empty">
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
    <form className="cis-wrap cis-entry" onSubmit={p.save}>
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
              placeholder="+971… or email"
            />
          </Field>
          <Field label="Client ID number">
            <input
              className="form-control"
              value={p.form.client_id_number}
              onChange={(e) => p.set("client_id_number", e.target.value)}
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
        <div className={`cis-folder ${p.folder ? "ok" : "missing"}`}>
          <b>
            {p.folder ? "Documents folder mapped" : "Documents folder not set"}
          </b>
          <span>
            {p.folder?.name ||
              "Open Setup to choose a local or network folder."}
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
                        onChange={(e) =>
                          p.setFiles((current) => ({
                            ...current,
                            [item.document_code]: e.target.files?.[0] || null,
                          }))
                        }
                      />
                      <small>
                        {p.files[item.document_code]?.name ||
                          doc.local_file_name ||
                          "Attachment required"}
                      </small>
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
          <button className="btn primary" disabled={!p.canMake || p.saving}>
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
  const allocations = p.form.distribution
    .map((item, index) => ({
      item,
      index,
    }))
    .filter(({ item }) => item.line_kind === "residual");
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
  const amountCell = (item, lineIndex) => (
    <>
      <span
        className={`cis-balance ${num(item.payable_aed) - p.paid(item) > 0 ? "due" : "settled"}`}
      >
        {money(p.paid(item))}
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
  return (
    <Section number="5" title="Commission distribution">
      <p className="form-hint strong">
        Commission receivable (net of VAT) — 100% distribution base:{" "}
        {money(p.gross)}
      </p>
      <div className="table-wrap">
        <table className="cis-dist">
          <thead>
            <tr>
              <th>Type</th>
              <th>Party</th>
              <th>Name / company</th>
              <th>%</th>
              <th>Payable amount (AED)</th>
              <th>Paid amount (AED)</th>
              <th>Balance (AED)</th>
              <th>Payment mode</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allocations.map(({ item, index }) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <select
                      className="form-control"
                      value={item.type_label || ""}
                      onChange={(event) =>
                        p.updateLine(index, "type_label", event.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {p.types.map((type) => (
                        <option key={type}>{type}</option>
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
                    />
                  </td>
                  <td>
                    <Amount
                      value={item.payable_aed ?? ""}
                      onChange={(value) =>
                        p.updateLine(index, "payable_aed", value)
                      }
                    />
                  </td>
                  <td>{amountCell(item, index)}</td>
                  <td>
                    <span className="cis-balance">
                      {money(num(item.payable_aed) - p.paid(item))}
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
                  <td>
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
                  </td>
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
        onClick={() =>
          p.setForm((current) => ({
            ...current,
            distribution: [
              ...current.distribution,
              line(
                "residual",
                p.types[0] || "Residual Allocation",
                "Internal Agent",
              ),
            ],
          }))
        }
      >
        + Add agent
      </button>
      <p className="form-hint">
        Allocated from residual:{" "}
        {money(
          allocations.reduce((sum, row) => sum + num(row.item.payable_aed), 0),
        )}{" "}
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
      <Section title="Documents storage location">
        <p className="form-hint strong">
          {p.folder ? `Folder mapped: ${p.folder.name}` : "Folder not set."}
        </p>
        <div className="cis-inline-actions">
          <button className="btn primary" onClick={p.chooseFolder}>
            Choose documents folder…
          </button>
        </div>
        <p className="form-hint">
          Point this at any folder on your computer. Once your shared network
          drive is ready (for example N:\CommissionDocs), choose the new
          location; every attachment from then on goes there.
        </p>
        <p className="form-hint">
          Works in Chrome and Edge. Your browser may ask you to reconfirm access
          when you reopen the app.
        </p>
      </Section>
      <Section title="Transaction records storage">
        <p className="form-hint strong">
          Transaction records are stored in the project Supabase database.
        </p>
        <p className="form-hint">
          Local folder preferences remain in this browser. Use the Excel backup
          below for a portable record backup.
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
