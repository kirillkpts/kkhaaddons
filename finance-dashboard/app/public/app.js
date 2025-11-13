let current = "expenses";
const BOOTSTRAP = (typeof window !== 'undefined' && window.__BOOTSTRAP__) ? window.__BOOTSTRAP__ : null;
const BOOTSTRAP_USED = { config: false, initial: false };
let CONFIG = null;
let editingId = null;
let RAW_RESULTS = [];
let LOAD_TOKEN = 0;
let SORT = { key: "date", dir: -1 };
let PAGE_SIZE = 20;
let LOAD_ALL = false;
let CURRENT_CURSOR = null;
let NEXT_CURSOR = null;
let CURSOR_STACK = [];
let CURRENT_PAGE = 1;
let PERIOD = null;
let VIEW_MODE = "auto";
let DEFAULT_WHO = "";
let CURRENT_USER = "";
let SETTINGS_LANGUAGE_BASELINE = "en";
let SETTINGS_LANGUAGE_PENDING = "en";

let CURRENT_VIEW = "transactions";
let CHART_TYPE = "pie";
let CATEGORY_CHART = null;
let STATS_PERIOD = "this_month";
let STATS_FROM_MONTH = "";
let STATS_TO_MONTH = "";
let SUMMARY_PERIOD = "this_month";
let SUMMARY_FROM_MONTH = "";
let SUMMARY_TO_MONTH = "";
let WHO_OPTIONS = [];
const BACKUP_TIME_FALLBACK = "03:00";
const BACKUP_TIME_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;
let BACKUP_CONFIG = { scriptUrl: "", autoEnabled: false, lastRunAt: null, runTime: BACKUP_TIME_FALLBACK, defaultRunTime: BACKUP_TIME_FALLBACK };
let BACKUP_FILES = [];
let ORIGINAL_CURRENCY_RATES = null;
const INCOME_CATEGORY_VALUE = "__INCOME__";
const INCOME_CATEGORY_LABEL = (window.i18n?.t && window.i18n.t('settings.categories.income')) || "Income";
const API_REQUEST_TIMEOUT = 12000;

function getTranslation(key, fallback) {
  if (window.i18n?.t) {
    const translated = window.i18n.t(key);
    if (translated && translated !== key) return translated;
  }
  return fallback || key;
}

function getActiveLanguage() {
  try {
    return window.i18n?.getCurrentLanguage?.() || "en";
  } catch {
    return "en";
  }
}

function applyLanguage(lang) {
  if (!window.i18n?.setLanguage) return Promise.resolve();
  const target = lang || "en";
  try {
    const result = window.i18n.setLanguage(target);
    if (result && typeof result.then === "function") return result;
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

async function apiFetch(url, options = {}) {
  const {
    timeout = API_REQUEST_TIMEOUT,
    parse = "json",
    signal,
    ...rest
  } = options;
  const controller = new AbortController();
  const useLocalSignal = !signal;
  const opts = { ...rest, signal: signal || controller.signal };
  const timer = timeout > 0 && useLocalSignal ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, opts);
    let payload = null;
    if (parse === "json") {
      try { payload = await response.json(); } catch { payload = null; }
    } else if (parse === "text") {
      try { payload = await response.text(); } catch { payload = ""; }
    }
    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && payload.error) ||
        (typeof payload === "string" && payload) ||
        getTranslation('message.network.defaultError', "Request failed");
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (parse === "json") return payload ?? {};
    if (parse === "text") return typeof payload === "string" ? payload : "";
    return response;
  } catch (err) {
    if (err.name === "AbortError" && !err.message) {
      err.message = getTranslation('message.network.timeout', "Network timeout: server did not respond.");
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureIncomeOption(select) {
  if (!select) return;
  const exists = Array.from(select.options || []).some((opt) => opt.value === INCOME_CATEGORY_VALUE);
  if (!exists) {
    const option = document.createElement("option");
    option.value = INCOME_CATEGORY_VALUE;
    option.textContent = INCOME_CATEGORY_LABEL;
    select.appendChild(option);
  }
}

function normalizeBackupTime(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  const match = candidate.match(BACKUP_TIME_REGEX);
  if (!match) return BACKUP_TIME_FALLBACK;
  const hours = String(match[1]).padStart(2, "0");
  const minutes = String(match[2]).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function updateCategoryFieldState() {
  const field = document.getElementById("field-category");
  const select = document.getElementById("f-categories");
  const hide = current === "income";
  if (field) {
    field.style.display = hide ? "none" : "grid";
  }
  if (select) {
    if (hide) {
      ensureIncomeOption(select);
      select.value = INCOME_CATEGORY_VALUE;
    }
    select.disabled = hide;
  }
}

function updateFormMode({ editing } = {}) {
  const isEditing = editing ?? Boolean(editingId);
  const isIncome = current === "income";
  // Используем переводы, если доступны; иначе fallback
  const t = window.i18n?.t || ((key) => {
    const fallback = {
      'form.addExpense': 'Добавление расхода',
      'form.addIncome': 'Добавление дохода',
      'form.editExpense': 'Редактирование расхода',
      'form.editIncome': 'Редактирование дохода',
      'transactions.addExpense': 'Добавить расход',
      'transactions.addIncome': 'Добавить доход'
    };
    return fallback[key] || key;
  });
  
  const formKey = isEditing 
    ? (isIncome ? 'form.editIncome' : 'form.editExpense')
    : (isIncome ? 'form.addIncome' : 'form.addExpense');
  
  const addBtnKey = isIncome ? 'transactions.addIncome' : 'transactions.addExpense';
  
  const badge = document.getElementById("form-type-badge");
  if (badge) {
    badge.textContent = t(formKey);
  }
  const title = document.getElementById("modal-title");
  if (title) {
    title.textContent = t(formKey);
  }
  const addBtn = document.getElementById("add-btn");
  if (addBtn) addBtn.textContent = t(addBtnKey);
  const fabAdd = document.getElementById("fab-add");
  if (fabAdd) fabAdd.setAttribute("aria-label", t(addBtnKey));
  updateCategoryFieldState();
}

async function fetchConfig() {
  // Use server-provided bootstrap config to avoid initial fetch
  if (!CONFIG && BOOTSTRAP && BOOTSTRAP.config && !BOOTSTRAP_USED.config) {
    CONFIG = BOOTSTRAP.config || {};
    BOOTSTRAP_USED.config = true;
    updateCategoriesState(CONFIG.categories || []);
    updateCurrenciesState(CONFIG.currencies || [], CONFIG.currencyRates || {});
    return;
  }
  const data = await apiFetch("/config.json");
  CONFIG = data || {};
  updateCategoriesState(CONFIG.categories || []);
  updateCurrenciesState(CONFIG.currencies || [], CONFIG.currencyRates || {});
}

function headerCell(text, key) {
  const th = document.createElement("th");
  th.style.cursor = key ? "pointer" : "default";
  th.dataset.key = key || "";
  th.onclick = () => {
    if (!key) return;
    if (SORT.key === key) SORT.dir = -SORT.dir;
    else {
      SORT.key = key;
      SORT.dir = -1;
    }
    resetPaging();
    loadData();
  };
  const arrow = SORT.key === key ? (SORT.dir > 0 ? " ▲" : " ▼") : "";
  th.textContent = text + arrow;
  return th;
}

function td(text) {
  const e = document.createElement("td");
  e.textContent = text ?? "";
  return e;
}

function getValue(p, key) {
  const prop = p?.[CONFIG?.props?.[key]];
  if (!prop) return "";
  switch (key) {
    case "description":
      return prop.title?.[0]?.text?.content || "";
    case "categories":
      return prop.select?.name || prop.multi_select?.[0]?.name || "";
    case "amount":
      return typeof prop.number === "number" ? prop.number : "";
    case "currency":
      return prop.select?.name || "";
    case "date":
      return prop.date?.start || "";
    case "who":
      return prop.rich_text?.[0]?.plain_text || "";
    case "usdAmount":
      if (prop.formula && typeof prop.formula.number === "number") return prop.formula.number;
      if (typeof prop.number === "number") return prop.number;
      if (Array.isArray(prop.rich_text) && prop.rich_text[0]?.plain_text) {
        const parsed = Number(prop.rich_text[0].plain_text);
        return Number.isFinite(parsed) ? parsed : "";
      }
      return "";
    default:
      return "";
  }
}

function toInputDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / oneDay);
  const t = window.i18n?.t || ((k) => k);
  const lang = (window.i18n?.getCurrentLanguage && window.i18n.getCurrentLanguage()) || 'en';
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const timePart = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0 && diffMs >= 0) return `${t('date.today')} ${timePart}`;
  if (diffDays === 1) return `${t('date.yesterday')} ${timePart}`;
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const usdFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatUsd(amount) {
  const lang = (window.i18n?.getCurrentLanguage && window.i18n.getCurrentLanguage()) || 'en';
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    const zero = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(0);
    return zero;
  }
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function getChartValueFromContext(context) {
  if (typeof context?.raw === "number") return context.raw;
  if (context?.raw && typeof context.raw === "object") {
    if (typeof context.raw.y === "number") return context.raw.y;
    if (typeof context.raw.x === "number") return context.raw.x;
  }
  const parsed = context?.parsed;
  if (typeof parsed === "number") return parsed;
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.y === "number") return parsed.y;
    if (typeof parsed.x === "number") return parsed.x;
  }
  return 0;
}

function getCurrencyRateValue(code) {
  const currency = (code || "").toUpperCase();
  if (!currency || currency === "USD") return 1;
  const rate = Number(CONFIG?.currencyRates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return rate;
}

function updateUsdPreview() {
  const amountInput = document.getElementById("f-amount");
  const currencySelect = document.getElementById("f-currency");
  const usdNode = document.getElementById("f-usd-display");
  if (!usdNode) return;
  const amount = Number(amountInput?.value || "");
  if (!Number.isFinite(amount)) {
    usdNode.textContent = "-";
    return;
  }
  const currency = (currencySelect?.value || "").toUpperCase();
  const rate = getCurrencyRateValue(currency);
  usdNode.textContent = formatUsd(Number((amount * rate).toFixed(2)));
}

function fillForm(item) {
  const p = item?.properties || {};
  document.getElementById("f-description").value = getValue(p, "description");
  const categorySelect = document.getElementById("f-categories");
  if (current === "income") {
    ensureIncomeOption(categorySelect);
    if (categorySelect) categorySelect.value = INCOME_CATEGORY_VALUE;
  } else if (categorySelect) {
    categorySelect.value = getValue(p, "categories");
  }
  document.getElementById("f-amount").value = getValue(p, "amount");
  document.getElementById("f-currency").value = getValue(p, "currency");
  document.getElementById("f-date").value = toInputDateTime(getValue(p, "date"));
  document.getElementById("f-who").value = getValue(p, "who");
  const usd = getValue(p, "usdAmount");
  const node = document.getElementById("f-usd-display");
  if (node) node.textContent = usd === "" ? "-" : formatUsd(usd);
  updateUsdPreview();
}

function readForm() {
  const base = {
    description: document.getElementById("f-description").value.trim(),
    amount: parseFloat(document.getElementById("f-amount").value) || 0,
    currency: document.getElementById("f-currency").value.trim().toUpperCase(),
    date: document.getElementById("f-date").value || null,
    who: document.getElementById("f-who").value.trim()
  };
  if (current === "income") {
    return { ...base, categories: null };
  }
  return { ...base, categories: document.getElementById("f-categories").value };
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg || "";
}

function populateCategorySelects() {
  const categories = CONFIG?.categories || [];
  const formSelect = document.getElementById("f-categories");
  const filterSelect = document.getElementById("flt-category");
  if (formSelect) {
    const selected = formSelect.value;
    formSelect.innerHTML = "";
    categories.forEach((c) => {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = c;
      formSelect.appendChild(option);
    });
    ensureIncomeOption(formSelect);
    if (selected && categories.includes(selected)) {
      formSelect.value = selected;
    } else if (current === "income") {
      formSelect.value = INCOME_CATEGORY_VALUE;
    } else if (formSelect.options.length) {
      formSelect.selectedIndex = 0;
    }
  }
  if (filterSelect) {
    const currentVal = filterSelect.value;
    const t = window.i18n?.t || ((k) => k);
    filterSelect.innerHTML = `<option value="">${t('filters.all')}</option>`;
    categories.forEach((c) => {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = c;
      filterSelect.appendChild(option);
    });
    filterSelect.value = categories.includes(currentVal) ? currentVal : "";
  }
}

function populateCurrencySelects() {
  const currencies = CONFIG?.currencies || [];
  const formSelect = document.getElementById("f-currency");
  const filterSelect = document.getElementById("flt-currency");
  if (formSelect) {
    const selected = formSelect.value;
    formSelect.innerHTML = "";
    currencies.forEach((c) => {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = c;
      formSelect.appendChild(option);
    });
    if (selected && currencies.includes(selected)) {
      formSelect.value = selected;
    } else if (formSelect.options.length) {
      formSelect.selectedIndex = 0;
    }
  }
  if (filterSelect) {
    const currentVal = filterSelect.value;
    const t = window.i18n?.t || ((k) => k);
    filterSelect.innerHTML = `<option value="">${t('filters.all')}</option>`;
    currencies.forEach((c) => {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = c;
      filterSelect.appendChild(option);
    });
    filterSelect.value = currencies.includes(currentVal) ? currentVal : "";
  }
}

function renderSettingsList(node, items, emptyLabel, kind) {
  if (!node) return;
  node.innerHTML = "";
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyLabel;
    node.appendChild(empty);
    return;
  }
  values.forEach((value) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = value;
    li.appendChild(span);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.value = value;
    btn.dataset.kind = kind;
    btn.setAttribute("aria-label", `${(window.i18n?.t && window.i18n.t('action.delete')) || 'Удалить'} ${value}`);
    btn.textContent = "×";
    li.appendChild(btn);
    node.appendChild(li);
  });
}

function renderCategorySettings() {
  const list = document.getElementById("settings-category-list");
  const t = window.i18n?.t || ((k) => k);
  renderSettingsList(list, CONFIG?.categories || [], t('settings.categories.empty'), "category");
}

function formatRateValue(rate) {
  const num = Number(rate);
  if (!Number.isFinite(num) || num <= 0) return "";
  return (Math.round(num * 1e6) / 1e6).toString();
}

function renderCurrencySettings() {
  const list = document.getElementById("settings-currency-list");
  if (!list) return;
  list.innerHTML = "";
  const currencies = Array.isArray(CONFIG?.currencies) ? CONFIG.currencies : [];
  const rates = CONFIG?.currencyRates || {};
  if (!currencies.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = (window.i18n?.t && window.i18n.t('settings.currencies.empty')) || "Валюты пока не добавлены";
    list.appendChild(empty);
    return;
  }
  currencies.forEach((code) => {
    const li = document.createElement("li");
    li.classList.add("currency-item");
    const label = document.createElement("span");
    label.textContent = code;
    li.appendChild(label);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "currency-rate-input";
    input.step = "0.000001";
    input.min = "0";
    input.placeholder = (window.i18n?.t && window.i18n.t('settings.currencies.rate')) || "Курс к USD";
    input.dataset.code = code;
    input.value = formatRateValue(rates[code]);
    input.addEventListener("input", () => {
      const parsed = parseRateInput(input.value);
      if (!CONFIG.currencyRates) CONFIG.currencyRates = {};
      if (parsed === null) delete CONFIG.currencyRates[code];
      else CONFIG.currencyRates[code] = parsed;
      updateUsdPreview();
    });
    li.appendChild(input);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.dataset.value = code;
    removeBtn.setAttribute("aria-label", `${(window.i18n?.t && window.i18n.t('action.delete')) || 'Удалить'} ${code}`);
    removeBtn.textContent = "×";
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

function updateCategoriesState(categories = []) {
  if (!CONFIG) CONFIG = {};
  CONFIG.categories = Array.isArray(categories) ? [...categories] : [];
  populateCategorySelects();
  renderCategorySettings();
}

function updateCurrenciesState(currencies = [], rates = {}) {
  if (!CONFIG) CONFIG = {};
  CONFIG.currencies = Array.isArray(currencies)
    ? currencies.map((code) => (code || "").toUpperCase()).filter(Boolean)
    : [];
  const map = {};
  CONFIG.currencies.forEach((code) => {
    const rate = parseRateInput(rates[code]);
    map[code] = rate === null ? 1 : rate;
  });
  CONFIG.currencyRates = map;
  populateCurrencySelects();
  renderCurrencySettings();
  updateUsdPreview();
}

function formatBytes(bytes) {
  const value = Number(bytes);
  const lang = (window.i18n?.getCurrentLanguage && window.i18n.getCurrentLanguage()) || 'en';
  const units = lang === 'ru' ? ["Б", "КБ", "МБ", "ГБ", "ТБ"] : ["B", "KB", "MB", "GB", "TB"];
  if (!Number.isFinite(value) || value < 0) return `0 ${units[0]}`;
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = current < 10 && unitIndex > 0 ? 1 : 0;
  return `${current.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatBackupTimestamp(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const lang = (window.i18n?.getCurrentLanguage && window.i18n.getCurrentLanguage()) || 'en';
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setBackupStatus(message = "", type = "info") {
  const node = document.getElementById("backup-status");
  if (!node) return;
  node.textContent = message || "";
  node.dataset.statusType = message ? type : "";
  node.hidden = !message;
}

function renderBackupList() {
  const container = document.getElementById("backup-list");
  if (!container) return;
  container.innerHTML = "";
  if (!BACKUP_FILES.length) {
    const empty = document.createElement("div");
    empty.className = "backup-empty";
    const t = window.i18n?.t || ((k) => k);
    empty.textContent = BACKUP_CONFIG.scriptUrl
      ? t('settings.backups.noBackups')
      : t('settings.backups.unavailable');
    container.appendChild(empty);
    return;
  }

  BACKUP_FILES.forEach((file) => {
    const row = document.createElement("div");
    row.className = "backup-row";

    const info = document.createElement("div");
    info.className = "backup-info";
    const title = document.createElement("strong");
    title.textContent = file.name || "backup";
    const meta = document.createElement("span");
    const dateText = formatBackupTimestamp(file.ts);
    const sizeText = formatBytes(file.size);
    meta.textContent = `${dateText}${dateText && sizeText ? " • " : ""}${sizeText}`;
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "backup-actions-inline";
    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "btn secondary";
  restoreBtn.textContent = (window.i18n?.t && window.i18n.t('action.restore')) || "Восстановить";
    restoreBtn.dataset.action = "restore";
    restoreBtn.dataset.name = file.name;
    actions.appendChild(restoreBtn);

    row.append(info, actions);
    container.appendChild(row);
  });
}

function renderBackupSettings() {
  const autoToggle = document.getElementById("backup-auto-toggle");
  const timeInput = document.getElementById("backup-run-time");
  const lastRun = document.getElementById("backup-last-run");
  const refreshBtn = document.getElementById("backup-refresh");
  const runBtn = document.getElementById("backup-run");
  const scriptHint = document.getElementById("backup-script-hint");
  const scriptUrl = BACKUP_CONFIG.scriptUrl || "";
  const hasScript = Boolean(scriptUrl);
  const effectiveRunTime = normalizeBackupTime(BACKUP_CONFIG.runTime || BACKUP_CONFIG.defaultRunTime || BACKUP_TIME_FALLBACK);
  if (autoToggle) {
    autoToggle.checked = Boolean(BACKUP_CONFIG.autoEnabled);
    autoToggle.disabled = !hasScript;
  }
  if (timeInput) {
    timeInput.value = effectiveRunTime;
    timeInput.disabled = !hasScript;
  }
  if (refreshBtn) refreshBtn.disabled = !hasScript;
  if (runBtn) runBtn.disabled = !hasScript;
  if (scriptHint) {
    if (hasScript) {
      scriptHint.textContent = (window.i18n?.t && window.i18n.t('settings.backups.usingWebhookHint')) || "Автокопирование использует URL вебхука из конфигурации аддона Home Assistant.";
      scriptHint.classList.remove("warning");
    } else {
      scriptHint.textContent = (window.i18n?.t && window.i18n.t('settings.backups.missingWebhookHint')) || "Укажите URL вебхука Google Script в конфигурации аддона Home Assistant, чтобы включить автокопирование.";
      scriptHint.classList.add("warning");
    }
  }
  if (lastRun) {
    if (!hasScript) {
      lastRun.textContent = (window.i18n?.t && window.i18n.t('settings.backups.configureWebhookFirst')) || "Настройте вебхук в конфигурации аддона Home Assistant, чтобы включить резервные копии.";
    } else if (!BACKUP_CONFIG.autoEnabled) {
      lastRun.textContent = (window.i18n?.t && window.i18n.t('settings.backups.autoDisabled')) || "Автокопирование отключено.";
    } else if (BACKUP_CONFIG.lastRunAt) {
      const t = window.i18n?.t || ((k)=>k);
      lastRun.textContent = (t('settings.backups.nextRunAndLastCopy') || '').replace('{time}', effectiveRunTime).replace('{last}', formatBackupTimestamp(BACKUP_CONFIG.lastRunAt));
    } else {
      const t = window.i18n?.t || ((k)=>k);
      lastRun.textContent = (t('settings.backups.scheduledAt') || '').replace('{time}', effectiveRunTime);
    }
  }
  renderBackupList();
}

async function loadBackupConfigData({ silentStatus = false } = {}) {
  try {
    const data = await apiFetch("/backup/config");
    const defaultRunTime = normalizeBackupTime(data?.defaultRunTime || BACKUP_CONFIG.defaultRunTime || BACKUP_TIME_FALLBACK);
    const runTime = normalizeBackupTime(data?.runTime || BACKUP_CONFIG.runTime || defaultRunTime);
    BACKUP_CONFIG = {
      scriptUrl: data?.scriptUrl || "",
      autoEnabled: Boolean(data?.autoEnabled),
      lastRunAt: data?.lastRunAt || null,
      runTime,
      defaultRunTime
    };
    renderBackupSettings();
    if (!silentStatus) setBackupStatus("");
  } catch (err) {
    console.error("Failed to load backup config", err);
    setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.loadConfigError')) || "Не удалось загрузить настройки резервного копирования", "error");
  }
}

async function loadBackupListData() {
  try {
    const data = await apiFetch("/backup/list");
    BACKUP_FILES = Array.isArray(data?.files) ? data.files : [];
    renderBackupList();
    setBackupStatus("");
  } catch (err) {
    console.error("Failed to load backup list", err);
    setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.loadListError')) || "Не удалось загрузить список резервных копий", "error");
  }
}

async function saveBackupConfigFromUI() {
  const autoToggle = document.getElementById("backup-auto-toggle");
  const timeInput = document.getElementById("backup-run-time");
  if (!autoToggle || !timeInput) return true;
  const autoEnabled = Boolean(autoToggle.checked);
  const requestedRunTime = normalizeBackupTime(timeInput.value || BACKUP_CONFIG.runTime || BACKUP_CONFIG.defaultRunTime || BACKUP_TIME_FALLBACK);
  if (autoEnabled && !BACKUP_CONFIG.scriptUrl) {
    setBackupStatus("Сначала укажите URL вебхука в конфигурации аддона Home Assistant.", "error");
    return false;
  }
  const currentRunTime = normalizeBackupTime(BACKUP_CONFIG.runTime || BACKUP_CONFIG.defaultRunTime || BACKUP_TIME_FALLBACK);
  if (autoEnabled === BACKUP_CONFIG.autoEnabled && requestedRunTime === currentRunTime) {
    setBackupStatus("");
    return true;
  }
  setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.saving')) || "Сохраняю настройки резервного копирования...", "info");
  try {
    const data = await apiFetch("/backup/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoEnabled, runTime: requestedRunTime })
    });
    if (data?.error) {
      throw new Error(data.error || (window.i18n?.t && window.i18n.t('message.backup.saveError')) || "Не удалось сохранить настройки резервного копирования");
    }
    const defaultRunTime = normalizeBackupTime(data?.config?.defaultRunTime || BACKUP_CONFIG.defaultRunTime || BACKUP_TIME_FALLBACK);
    BACKUP_CONFIG = {
      scriptUrl: data?.config?.scriptUrl || BACKUP_CONFIG.scriptUrl,
      autoEnabled: Boolean(data?.config?.autoEnabled),
      lastRunAt: data?.config?.lastRunAt || null,
      runTime: normalizeBackupTime(data?.config?.runTime || requestedRunTime || defaultRunTime),
      defaultRunTime
    };
    renderBackupSettings();
  setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.saved')) || "Настройки резервного копирования сохранены.", "success");
    return true;
  } catch (err) {
    console.error("Failed to save backup config", err);
  setBackupStatus(err?.message || (window.i18n?.t && window.i18n.t('message.backup.saveError')) || "Не удалось сохранить настройки резервного копирования", "error");
    return false;
  }
}

async function runBackupNow() {
  const button = document.getElementById("backup-run");
  if (button) button.disabled = true;
  setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.creating')) || "Создаю резервную копию...", "info");
  try {
    const data = await apiFetch("/backup/run", { method: "POST" });
    if (data?.error) {
      throw new Error(data.error || (window.i18n?.t && window.i18n.t('message.backup.createError')) || "Не удалось создать резервную копию");
    }
  setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.created')) || "Резервная копия успешно создана.", "success");
  } catch (err) {
    console.error("Failed to create backup", err);
  setBackupStatus(err?.message || (window.i18n?.t && window.i18n.t('message.backup.createError')) || "Не удалось создать резервную копию", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function restoreBackup(name) {
  if (!name) return;
  const t = window.i18n?.t || ((k)=>k);
  const confirmed = window.confirm((t('message.backup.restoreConfirm') || '').replace('{name}', name));
  if (!confirmed) return;
  setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.restoring')) || "Восстанавливаю резервную копию...", "info");
  try {
    const data = await apiFetch("/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (data?.error) {
      throw new Error(data.error || (window.i18n?.t && window.i18n.t('message.backup.restoreError')) || "Не удалось восстановить резервную копию");
    }
  setBackupStatus((window.i18n?.t && window.i18n.t('message.backup.restored')) || "Резервная копия восстановлена. Обновите страницу через несколько секунд.", "success");
  } catch (err) {
    console.error("Failed to restore backup", err);
  setBackupStatus(err?.message || (window.i18n?.t && window.i18n.t('message.backup.restoreError')) || "Не удалось восстановить резервную копию", "error");
  }
}

async function createCategory(value) {
  const data = await apiFetch("/options/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: value })
  });
  updateCategoriesState(data.categories || []);
}

async function deleteCategory(value) {
  const data = await apiFetch("/options/categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: value })
  });
  if (data?.error) {
    throw new Error(data.error || (window.i18n?.t && window.i18n.t('message.category.deleteError')) || "Не удалось удалить категорию");
  }
  updateCategoriesState(data.categories || CONFIG?.categories || []);
}

function parseRateInput(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(rate * 1e6) / 1e6;
}

async function createCurrency(code, rate) {
  const normalizedCode = (code || "").toUpperCase();
  if (!normalizedCode) {
    const err = new Error("Код валюты не может быть пустым");
    err.status = 400;
    throw err;
  }
  const payload = { code: normalizedCode };
  if (rate !== null && rate !== undefined) payload.rate = rate;
  const data = await apiFetch("/options/currencies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  updateCurrenciesState(data.currencies || [], data.currencyRates || {});
}

async function deleteCurrency(code) {
  const normalizedCode = (code || "").toUpperCase();
  if (!normalizedCode) return;
  const data = await apiFetch("/options/currencies", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizedCode })
  });
  updateCurrenciesState(data.currencies || [], data.currencyRates || {});
}

async function saveCurrencyRates() {
  const inputs = Array.from(document.querySelectorAll(".currency-rate-input"));
  if (!inputs.length) return true;
  const rates = {};
  const current = CONFIG?.currencyRates || {};
  for (const input of inputs) {
    const code = (input.dataset.code || "").toUpperCase();
    if (!code) continue;
    const raw = (input.value || "").trim();
    if (!raw) {
      const existing = current[code];
      if (!existing) {
        alert("Укажите корректный курс для валюты «" + code + "»");
        input.focus();
        return false;
      }
      rates[code] = existing;
      continue;
    }
    const parsed = parseRateInput(raw);
    if (parsed === null) {
      alert("Укажите корректный курс для валюты «" + code + "»");
      input.focus();
      return false;
    }
    rates[code] = parsed;
  }
  try {
    const data = await apiFetch("/options/currency-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates })
    });
    updateCurrenciesState(data.currencies || [], data.currencyRates || {});
    ORIGINAL_CURRENCY_RATES = { ...(CONFIG?.currencyRates || {}) };
    return true;
  } catch (err) {
    const fallback = (window.i18n?.t && window.i18n.t('message.currency.updateRatesError')) || "Не удалось обновить курсы валют";
    alert(err?.message || fallback);
    return false;
  }
}

function initSettingsControls() {
  const languagePicker = document.getElementById("settings-language");
  languagePicker?.addEventListener("change", handleLanguagePreview);

  const categoryForm = document.getElementById("category-form");
  categoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("new-category-input");
    const value = (input?.value || "").trim();
    if (!value) {
      input?.focus();
      return;
    }
    const submitBtn = categoryForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    try {
      await createCategory(value);
      if (input) input.value = "";
    } catch (err) {
      console.error("Failed to add category", err);
      alert(err?.message || (window.i18n?.t && window.i18n.t('message.category.addError')) || "Не удалось добавить категорию");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  const categoryList = document.getElementById("settings-category-list");
  categoryList?.addEventListener("click", async (event) => {
    const button = event.target?.closest("button");
    if (!button || !button.dataset.value) return;
    event.preventDefault();
    const value = button.dataset.value;
  const confirmRemoval = window.confirm(((window.i18n?.t && window.i18n.t('action.delete')) || 'Удалить') + " категорию «" + value + "»?");
    if (!confirmRemoval) return;
    try {
      await deleteCategory(value);
    } catch (err) {
      console.error("Failed to remove category", err);
      alert(err?.message || (window.i18n?.t && window.i18n.t('message.category.deleteError')) || "Не удалось удалить категорию");
    }
  });

  const currencyForm = document.getElementById("currency-form");
  currencyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const codeInput = document.getElementById("new-currency-input");
    const rateInput = document.getElementById("new-currency-rate-input");
    let code = (codeInput?.value || "").trim();
    if (!code) {
      codeInput?.focus();
      return;
    }
    code = code.toUpperCase();
    const rawRate = rateInput?.value || "";
    const rate = rawRate ? parseRateInput(rawRate) : null;
    if (rawRate && rate === null) {
      const t = window.i18n?.t || ((k)=>k);
      alert(t('settings.currencies.rate') || "Введите положительный курс к USD");
      rateInput?.focus();
      return;
    }
    const submitBtn = currencyForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    try {
      await createCurrency(code, rate ?? undefined);
      if (codeInput) codeInput.value = "";
      if (rateInput) rateInput.value = "";
    } catch (err) {
      console.error("Failed to add currency", err);
      alert(err?.message || (window.i18n?.t && window.i18n.t('message.currency.addError')) || "Не удалось добавить валюту");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  const currencyList = document.getElementById("settings-currency-list");
  currencyList?.addEventListener("click", async (event) => {
    const button = event.target?.closest("button");
    if (!button || !button.dataset.value) return;
    event.preventDefault();
    const value = button.dataset.value;
  const confirmRemoval = window.confirm(((window.i18n?.t && window.i18n.t('action.delete')) || 'Удалить') + " валюту «" + value + "»?");
    if (!confirmRemoval) return;
    try {
      await deleteCurrency(value);
    } catch (err) {
      console.error("Failed to remove currency", err);
      alert(err?.message || (window.i18n?.t && window.i18n.t('message.currency.deleteError')) || "Не удалось удалить валюту");
    }
  });

  document.getElementById("backup-run")?.addEventListener("click", async () => {
    await runBackupNow();
  });
  document.getElementById("backup-refresh")?.addEventListener("click", async () => {
  
  });
  document.getElementById("backup-list")?.addEventListener("click", async (event) => {
    const button = event.target?.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "restore") {
      await restoreBackup(button.dataset.name);
    }
  });
}

async function handleLanguagePreview(event) {
  const value = event?.target?.value || "en";
  if (SETTINGS_LANGUAGE_PENDING === value) return;
  SETTINGS_LANGUAGE_PENDING = value;
  try {
    await applyLanguage(value);
  } catch (err) {
    console.error("Failed to preview language", err);
  }
}

function initSettingsTabs() {
  const headers = Array.from(document.querySelectorAll(".settings-tab-headers .settings-tab"));
  const panels = Array.from(document.querySelectorAll(".settings-tab-panels .settings-panel"));
  const modalCard = document.querySelector('.settings-card');
  if (!headers.length || !panels.length) return;

  const animateToPanel = (tabName) => {
    if (!modalCard) return;
    // measure current height and lock it
    const beforeH = modalCard.getBoundingClientRect().height || 0;
    modalCard.style.height = beforeH + 'px';
    // prevent content overflow during animation
    const prevOverflow = modalCard.style.overflow;
    modalCard.style.overflow = 'hidden';

    // force reflow to ensure the browser registers the fixed height
    // eslint-disable-next-line no-unused-expressions
    modalCard.offsetHeight;

    // switch panels (make target visible so we can measure its height)
    headers.forEach((h) => {
      const is = h.dataset.tab === tabName;
      h.classList.toggle("active", is);
      h.setAttribute("aria-selected", is ? "true" : "false");
    });
    panels.forEach((p) => {
      const is = p.dataset.tab === tabName;
      p.hidden = !is;
      p.classList.toggle('active', is);
    });

    // next frame: measure new height and animate
    requestAnimationFrame(() => {
      const afterH = modalCard.scrollHeight || 0;
      // if heights equal, just clear overflow and height immediately
      if (Math.abs(afterH - beforeH) < 1) {
        modalCard.style.height = '';
        modalCard.style.overflow = prevOverflow || '';
        return;
      }
      // trigger transition to new height
      modalCard.style.height = afterH + 'px';

      const onEnd = (e) => {
        if (e.propertyName === 'height') {
          modalCard.style.height = '';
          modalCard.style.overflow = prevOverflow || '';
          modalCard.removeEventListener('transitionend', onEnd);
        }
      };
      modalCard.addEventListener('transitionend', onEnd);
    });
  };

  headers.forEach((h) => {
    h.addEventListener("click", () => {
      const name = h.dataset.tab;
      animateToPanel(name);
    });
  });
}

function populateWhoFilter(options = WHO_OPTIONS) {
  const filterSelect = document.getElementById("flt-who");
  if (!filterSelect) return;
  const currentValue = filterSelect.value;
  const t = window.i18n?.t || ((k) => k);
  filterSelect.innerHTML = `<option value="">${t('filters.all')}</option>`;
  options.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    filterSelect.appendChild(option);
  });
  filterSelect.value = currentValue;
}

function ensureWhoOption(name) {
  const value = (name || "").trim();
  if (!value) return;
  if (!WHO_OPTIONS.includes(value)) {
    WHO_OPTIONS.push(value);
    WHO_OPTIONS.sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
    populateWhoFilter();
  }
}

async function loadWhoOptions(force = false) {
  try {
    const query = force ? "?force=1" : "";
    const data = await apiFetch(`/options/who${query}`);
    if (Array.isArray(data?.options)) {
      WHO_OPTIONS = data.options.slice().sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
      populateWhoFilter();
    }
  } catch (err) {
    console.error("Failed to load who options", err);
  }
}
function baseParams() {
  const params = new URLSearchParams();
  const pageSizeParam = LOAD_ALL ? 100 : PAGE_SIZE;
  params.set("limit", String(pageSizeParam));
  if (SORT.key) params.set("sortKey", SORT.key);
  params.set("sortDir", SORT.dir > 0 ? "asc" : "desc");

  const category = document.getElementById("flt-category").value;
  const currency = document.getElementById("flt-currency").value;
  const who = document.getElementById("flt-who").value.trim();
  const from = document.getElementById("flt-date-from").value;
  const to = document.getElementById("flt-date-to").value;

  // If datetime-local values are used, convert to date-only strings for server comparisons
  const normalizeDateOnly = (v) => {
    if (!v) return "";
    const s = String(v).trim();
    // if contains 'T' (datetime-local), keep only date part YYYY-MM-DD
    if (s.includes("T")) return s.slice(0, 10);
    return s;
  };
  const fromNorm = normalizeDateOnly(from);
  const toNorm = normalizeDateOnly(to);

  if (category) params.set("category", category);
  if (currency) params.set("currency", currency);
  if (who) params.set("who", who);
  if (fromNorm) params.set("from", fromNorm);
  if (toNorm) params.set("to", toNorm);
  if (PERIOD) params.set("period", PERIOD);

  return params;
}

async function loadData() {
  const token = ++LOAD_TOKEN;
  try {
    if (!CONFIG) await fetchConfig();
    const params = baseParams();
    RAW_RESULTS = [];
    NEXT_CURSOR = null;

    // Consume server-provided initial page to avoid first API call
    if (BOOTSTRAP && BOOTSTRAP.initial && !BOOTSTRAP_USED.initial) {
        try {
          const data = BOOTSTRAP.initial || {};
          if (token !== LOAD_TOKEN) return;
          RAW_RESULTS.push(...(data.results || []));
          NEXT_CURSOR = data.next_cursor || null;
          BOOTSTRAP_USED.initial = true;
        } catch {}
      } else {
        let localCursor = CURRENT_CURSOR;
        let localPage = 0;
        do {
        const query = new URLSearchParams(params);
        if (localCursor) query.set("cursor", localCursor);
          const data = await apiFetch(`/api/${current}?${query.toString()}`);
          if (token !== LOAD_TOKEN) return;
          RAW_RESULTS.push(...(data.results || []));
          NEXT_CURSOR = data.next_cursor || null;
          localCursor = NEXT_CURSOR;
          localPage += 1;
        if (!LOAD_ALL) break;
      } while (localCursor && localPage < 50);
    }

    if (CONFIG) {
      const aggregated = new Set(WHO_OPTIONS);
      for (const item of RAW_RESULTS) {
        const name = getValue(item.properties || {}, "who");
        if (name) aggregated.add(name);
      }
      const nextOptions = Array.from(aggregated).sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
      if (nextOptions.length !== WHO_OPTIONS.length || nextOptions.some((val, idx) => val !== WHO_OPTIONS[idx])) {
        WHO_OPTIONS = nextOptions;
        populateWhoFilter();
      }
    }

    renderTable();
    renderCards();
    updatePager(Boolean(NEXT_CURSOR));
    applyView();
  } catch (err) {
    console.error("Failed to load data", err);
    const fallback = (window.i18n?.t && window.i18n.t('message.loadError')) || "Не удалось загрузить данные";
    alert(err?.message || fallback);
  }
}

function renderTable() {
  const table = document.getElementById("records");
  if (!table) return;
  table.innerHTML = "";
  const head = document.createElement("tr");
  const t = window.i18n?.t || ((k) => k);
  [
    [t('table.description'), "description"],
    [t('table.category'), "categories"],
    [t('table.amount'), "amount"],
    [t('table.currency'), "currency"],
    [t('table.date'), "date"],
    [t('table.who'), "who"],
    [t('table.amountUsd'), "usdAmount"],
    [t('table.actions'), null]
  ].forEach(([label, key]) => head.appendChild(headerCell(label, key)));
  table.appendChild(head);

  for (const item of RAW_RESULTS) {
    const p = item.properties || {};
    const tr = document.createElement("tr");
    const columns = [
      (getValue(p, "description") || (window.i18n?.t && window.i18n.t('record.noDescription')) || '(без описания)'),
      getValue(p, "categories"),
      getValue(p, "amount"),
      getValue(p, "currency"),
      formatDisplayDate(getValue(p, "date")),
      getValue(p, "who"),
      formatUsd(getValue(p, "usdAmount"))
    ];
    columns.forEach((val) => tr.appendChild(td(val)));
    const actions = document.createElement("td");
    actions.className = "row-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.textContent = window.i18n?.t('action.edit') || "Редактировать";
    editBtn.onclick = () => {
      editingId = item.id;
      setDeleteButtonVisibility(true);
      updateFormMode({ editing: true });
      openModal();
      fillForm(item);
      updateFormMode({ editing: true });
    };
    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = window.i18n?.t('action.delete') || "Удалить";
    delBtn.onclick = async () => {
      if (await deleteRecord(item.id)) {
        await loadData();
        await loadWhoOptions(true);
      }
    };
    actions.append(editBtn, delBtn);
    tr.appendChild(actions);
    table.appendChild(tr);
  }
}

function badge(text) {
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = text || "";
  const { bg, fg } = colorFromText(text || "");
  b.style.backgroundColor = bg;
  b.style.color = fg;
  return b;
}

function el(text) {
  const span = document.createElement("span");
  span.textContent = text || "";
  return span;
}

function colorFromText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    bg: `hsl(${hue}, 90%, 92%)`,
    fg: `hsl(${hue}, 45%, 20%)`
  };
}

function renderCards() {
  const wrap = document.getElementById("cards");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const item of RAW_RESULTS) {
    const p = item.properties || {};
    const t = window.i18n?.t || ((k) => k);
    const title = getValue(p, "description") || t('record.noDescription');
    const amount = getValue(p, "amount");
    const currency = getValue(p, "currency");
    const usd = getValue(p, "usdAmount");
    const category = getValue(p, "categories");
    const who = getValue(p, "who");
    const date = formatDisplayDate(getValue(p, "date"));

    const card = document.createElement("div");
    card.className = "card";
    const header = document.createElement("div");
    header.className = "card-header";
    const titleEl = document.createElement("div");
    titleEl.className = "card-title";
    titleEl.textContent = title;
    const amountEl = document.createElement("div");
    amountEl.className = "card-amount";
    amountEl.textContent = `${amount} ${currency}`;
    header.append(titleEl, amountEl);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const row1 = document.createElement("div");
    row1.className = "row";
    const row2 = document.createElement("div");
    row2.className = "row";
    if (category) row1.appendChild(badge(category));
    if (currency) row1.appendChild(badge(currency));
    if (who) row1.appendChild(el(who));
    row2.append(el(date), el(`${t('details.amountUsd').replace(/:\s*$/,'')}: ${formatUsd(usd)} $`));
    meta.append(row1, row2);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const detailsBtn = document.createElement("button");
    detailsBtn.className = "btn";
    detailsBtn.textContent = window.i18n?.t('action.details') || "Подробнее";
    detailsBtn.onclick = () => openDetails(item);
    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.textContent = window.i18n?.t('action.edit') || "Редактировать";
    editBtn.onclick = () => {
      editingId = item.id;
      setDeleteButtonVisibility(true);
      updateFormMode({ editing: true });
      openModal();
      fillForm(item);
      updateFormMode({ editing: true });
    };
    actions.append(detailsBtn, editBtn);

    card.append(header, meta, actions);
    wrap.appendChild(card);
  }
}

async function deleteRecord(id, { showStatus = false } = {}) {
  if (!id) return false;
  if (!window.confirm("Удалить запись?")) return false;
  if (showStatus) setStatus("Удаление...");
  try {
    await apiFetch(`/api/${current}/${id}`, { method: "DELETE" });
    return true;
  } catch (err) {
    console.error("Failed to delete record", err);
    alert(err?.message || "Не удалось удалить запись");
    return false;
  } finally {
    if (showStatus) setStatus("");
  }
}

function openDetails(item) {
  const p = item.properties || {};
  const fields = [
    ["Описание", getValue(p, "description")],
    ["Категория", getValue(p, "categories")],
    ["Сумма", getValue(p, "amount")],
    ["Валюта", getValue(p, "currency")],
    ["Дата", formatDisplayDate(getValue(p, "date"))],
    ["Кто", getValue(p, "who")],
    ["Сумма в долларах", `${formatUsd(getValue(p, "usdAmount"))} $`]
  ];
  const container = document.getElementById("details-content");
  if (container) {
    container.innerHTML = "";
    for (const [label, val] of fields) {
      const row = document.createElement("div");
      row.className = "row";
      const left = document.createElement("div");
      left.className = "label";
      left.textContent = label;
      const right = document.createElement("div");
      right.textContent = val ?? "";
      row.append(left, right);
      container.appendChild(row);
    }
  }
  const modal = document.getElementById("details-modal");
  if (!modal) return;
  modal.style.display = "flex";
  document.getElementById("details-edit").onclick = () => {
    closeDetails();
    editingId = item.id;
    setDeleteButtonVisibility(true);
    updateFormMode({ editing: true });
    openModal();
    fillForm(item);
    updateFormMode({ editing: true });
  };
  document.getElementById("details-close").onclick = closeDetails;
  modal.addEventListener(
    "click",
    (e) => {
      if (e.target === modal) closeDetails();
    },
    { once: true }
  );
}

function closeDetails() {
  const modal = document.getElementById("details-modal");
  if (modal) modal.style.display = "none";
}

function updatePager(hasMore) {
  const info = document.getElementById("page-info");
  if (info) info.textContent = `Стр. ${CURRENT_PAGE}`;
  const prev = document.getElementById("prev-page");
  const next = document.getElementById("next-page");
  if (prev) prev.disabled = LOAD_ALL || CURRENT_PAGE <= 1;
  if (next) next.disabled = LOAD_ALL || !hasMore;
}

function openModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.style.display = "flex";
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.style.display = "none";
}

function resetPaging() {
  CURRENT_CURSOR = null;
  NEXT_CURSOR = null;
  CURSOR_STACK = [];
  CURRENT_PAGE = 1;
}

function setToggleActive(which) {
  document.getElementById("view-list")?.classList.toggle("active", which === "list");
  document.getElementById("view-cards")?.classList.toggle("active", which === "cards");
}

function applyView() {
  const tableWrap = document.querySelector(".table-wrap");
  const cards = document.getElementById("cards");
  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  const showCards = VIEW_MODE === "cards" || (VIEW_MODE === "auto" && isMobile);
  if (tableWrap) tableWrap.style.display = showCards ? "none" : "block";
  if (cards) cards.style.display = showCards ? "grid" : "none";
  if (VIEW_MODE === "auto") setToggleActive(showCards ? "cards" : "list");
}

function setDeleteButtonVisibility(visible) {
  const btn = document.getElementById("delete-btn");
  if (!btn) return;
  btn.style.display = visible ? "inline-flex" : "none";
}

function setPeriodActive(which) {
  const ids = ["period-today", "period-week", "period-month"];
  ids.forEach((id) => document.getElementById(id)?.classList.remove("active"));
  if (!which) return;
  const map = { today: "period-today", week: "period-week", month: "period-month" };
  const id = map[which];
  if (id) document.getElementById(id)?.classList.add("active");
}

function switchBase(type) {
  current = type;
  editingId = null;
  closeModal();
  setDeleteButtonVisibility(false);
  resetPaging();
  setBaseActiveUI();
  updateFormMode({ editing: false });
  loadData();
}

function setBaseActiveUI() {
  const expBtn = document.getElementById("exp");
  const incBtn = document.getElementById("inc");
  expBtn?.classList.toggle("active", current === "expenses");
  incBtn?.classList.toggle("active", current === "income");
}

function createPalette(count) {
  const bg = [];
  const border = [];
  for (let i = 0; i < count; i += 1) {
    const hue = (i * 53) % 360;
    bg.push(`hsl(${hue}, 82%, 55%)`);
    border.push(`hsl(${hue}, 82%, 40%)`);
  }
  return { bg, border };
}

function destroyCategoryChart() {
  if (CATEGORY_CHART) {
    CATEGORY_CHART.destroy();
    CATEGORY_CHART = null;
  }
}

function renderCategoryChart(items, palette) {
  const canvas = document.getElementById("categories-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = items.map((item) => item.category || "Без категории");
  const values = items.map((item) => Number(item.usd) || 0);
  destroyCategoryChart();
  const type = CHART_TYPE === "bar" ? "bar" : "pie";
  const dataset = {
    label: "USD",
    data: values,
    backgroundColor: type === "bar"
      ? palette.bg.map((c) => c.replace("hsl", "hsla").replace(")", ", 0.85)"))
      : palette.bg,
    borderColor: palette.border,
    borderWidth: type === "bar" ? 1 : 2,
    hoverOffset: type === "pie" ? 8 : 4
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: {
        callbacks: {
          label(context) {
            const value = getChartValueFromContext(context);
            return `${context.label}: ${formatUsd(value)} $`;
          }
        }
      }
    }
  };
  if (type === "bar") {
    options.scales = {
      x: { ticks: { color: "#374151" }, grid: { display: false } },
      y: { ticks: { color: "#374151" }, beginAtZero: true, grid: { color: "rgba(148, 163, 184, 0.2)" } }
    };
  }
  CATEGORY_CHART = new Chart(canvas, { type, data: { labels, datasets: [dataset] }, options });
  // make chart slices clickable — navigate to transactions with the same category and stats date range
  try {
    if (CATEGORY_CHART && typeof CATEGORY_CHART.options === "object") {
      CATEGORY_CHART.options.onClick = (evt, elements) => {
        if (!elements || !elements.length) return;
        const el = elements[0];
        const idx = el.index;
        const item = items[idx];
        if (item && item.category) {
          navigateToTransactionsForCategory(item.category);
        }
      };
      CATEGORY_CHART.update();
    }
  } catch (e) {
    // ignore if Chart API doesn't support onClick in this environment
  }
}

function renderStatsBreakdown(items, totalUsd, palette) {
  const list = document.getElementById("categories-breakdown");
  if (!list) return;
  list.innerHTML = "";
  items.forEach((item, idx) => {
    const li = document.createElement("li");
    const label = document.createElement("div");
    label.className = "stats-label";
    const dot = document.createElement("span");
    dot.className = "stats-dot";
    dot.style.backgroundColor = palette.bg[idx] || "#94a3b8";
    const text = document.createElement("span");
    text.textContent = item.category || "Без категории";
    label.append(dot, text);

    const value = document.createElement("div");
    value.className = "stats-value";
    const percent = totalUsd ? (item.usd / totalUsd) * 100 : 0;
    value.textContent = `${formatUsd(item.usd)} $ • ${formatPercent(percent)}`;

    li.append(label, value);
    // make the row clickable — navigate to transactions view when clicked
    li.style.cursor = "pointer";
    li.title = `Показать транзакции по категории ${item.category || "(без категории)"}`;
    li.addEventListener("click", () => {
      navigateToTransactionsForCategory(item.category);
    });
    list.appendChild(li);
  });
}

// Navigate to transactions view and apply category + date filters derived from current stats period
function navigateToTransactionsForCategory(category) {
  // set category filter
  const catSelect = document.getElementById("flt-category");
  if (catSelect) catSelect.value = category || "";

  const fromInput = document.getElementById("flt-date-from");
  const toInput = document.getElementById("flt-date-to");

  // Clear manual date inputs by default
  if (fromInput) fromInput.value = "";
  if (toInput) toInput.value = "";

  // Map stats period to transactions period or concrete date range
  if (STATS_PERIOD === "custom") {
    // STATS_FROM_MONTH / STATS_TO_MONTH are like YYYY-MM — convert to start/end ISO dates
    const fromMonth = STATS_FROM_MONTH;
    const toMonth = STATS_TO_MONTH || STATS_FROM_MONTH;
    if (fromMonth) {
      // set to datetime-local format (local) — use toInputDateTime helper
      const parts = fromMonth.split("-");
      if (parts.length === 2) {
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
        if (fromInput) fromInput.value = toInputDateTime(start.toISOString());
      }
    }
    if (toMonth) {
      const [y, m] = toMonth.split("-");
      if (y && m) {
        // last day of month: new Date(year, month (1-based), 0)
        const last = new Date(Number(y), Number(m), 0, 23, 59, 59, 0);
        if (toInput) toInput.value = toInputDateTime(last.toISOString());
      }
    }
    PERIOD = null;
    setPeriodActive(null);
  } else if (STATS_PERIOD === "today" || STATS_PERIOD === "last_week" || STATS_PERIOD === "last_30_days") {
    // use quick period buttons mapping
    PERIOD = STATS_PERIOD === "last_week" ? "last_week" : STATS_PERIOD === "last_30_days" ? "last_30_days" : "today";
    // visually set quick period
    if (PERIOD === "today") setPeriodActive("today");
    else if (PERIOD === "last_week") setPeriodActive("week");
    else if (PERIOD === "last_30_days") setPeriodActive("month");
  } else if (STATS_PERIOD === "this_month") {
    // set from/to to first and last day of current month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    // include full local time for datetime-local inputs
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 0);
    if (fromInput) fromInput.value = toInputDateTime(start.toISOString());
    if (toInput) toInput.value = toInputDateTime(end.toISOString());
    PERIOD = null;
    setPeriodActive(null);
  } else if (STATS_PERIOD === "last_month") {
    // previous calendar month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 0);
    if (fromInput) fromInput.value = toInputDateTime(start.toISOString());
    if (toInput) toInput.value = toInputDateTime(end.toISOString());
    PERIOD = null;
    setPeriodActive(null);
  } else {
    // fallback — clear period
    PERIOD = null;
    setPeriodActive(null);
  }

  // Ensure we are on expenses base (stats are aggregated for expenses)
  if (current !== "expenses") {
    // switchBase triggers loadData; avoid double-loading by only updating UI here
    current = "expenses";
    setBaseActiveUI();
    updateFormMode({ editing: false });
  }

  // Switch to transactions view and load data with new filters
  switchView("transactions");
  resetPaging();
  loadData();
}
function setStatsPeriodActive() {
  document.querySelectorAll("[data-stats-period]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.statsPeriod === STATS_PERIOD);
  });
  toggleStatsRangeVisibility();
}

function toggleStatsRangeVisibility() {
  const range = document.getElementById("stats-range");
  if (!range) return;
  if (STATS_PERIOD === "custom") range.classList.add("visible");
  else range.classList.remove("visible");
}

async function loadCategoryStats() {
  const loading = document.getElementById("stats-loading");
  const empty = document.getElementById("categories-empty");
  const list = document.getElementById("categories-breakdown");
  if (loading) loading.hidden = false;
  if (empty) {
    empty.hidden = true;
    empty.textContent = "Нет данных за выбранный период";
  }
  if (list) list.innerHTML = "";
  const params = new URLSearchParams();
  if (STATS_PERIOD === "custom") {
    if (STATS_FROM_MONTH) params.set("fromMonth", STATS_FROM_MONTH);
    if (STATS_TO_MONTH) params.set("toMonth", STATS_TO_MONTH);
    params.set("period", "custom");
  } else {
    params.set("period", STATS_PERIOD);
  }
  try {
    const data = await apiFetch(`/stats/categories?${params.toString()}`);
    const items = Array.isArray(data.items) ? data.items : [];
    const totalUsd = Number(data.totalUsd) || 0;
    if (!items.length) {
      destroyCategoryChart();
      if (empty) empty.hidden = false;
    } else {
      const palette = createPalette(items.length);
      renderCategoryChart(items, palette);
      renderStatsBreakdown(items, totalUsd, palette);
    }
  } catch (err) {
    console.error("Failed to load category stats", err);
    destroyCategoryChart();
    if (empty) {
  const t = window.i18n?.t || ((k)=>k);
  empty.textContent = t('message.loadError');
      empty.hidden = false;
    }
  } finally {
    if (loading) loading.hidden = true;
  }
}
function pluralizeOperations(count) {
  const t = window.i18n?.t || ((k)=>k);
  // RU plural rules; fallback to English simple form
  if (window.i18n?.getCurrentLanguage && window.i18n.getCurrentLanguage() === 'ru') {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return `${count} операций`;
    if (n1 > 1 && n1 < 5) return `${count} операции`;
    if (n1 === 1) return `${count} операция`;
    return `${count} операций`;
  }
  return `${count} operations`;
}

function formatRangeLabel(range) {
  if (!range) return "";
  const { start, end } = range;
  const fmt = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ru-RU");
  };
  const t = window.i18n?.t || ((key) => key);
  const periodLabel = t('summary.periodLabel');
  if (!start && !end) return `${periodLabel} ${t('summary.periodAll')}`;
  if (start && end) return `${periodLabel} ${fmt(start)} – ${fmt(end)}`;
  if (start) return `${periodLabel} ${t('summary.periodFrom')} ${fmt(start)}`;
  if (end) return `${periodLabel} ${t('summary.periodTo')} ${fmt(end)}`;
  return "";
}

function setSummaryPeriodActive() {
  document.querySelectorAll("[data-summary-period]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.summaryPeriod === SUMMARY_PERIOD);
  });
  toggleSummaryRangeVisibility();
}

function toggleSummaryRangeVisibility() {
  const range = document.getElementById("summary-range");
  if (!range) return;
  if (SUMMARY_PERIOD === "custom") range.classList.add("visible");
  else range.classList.remove("visible");
}

function updateSummaryCards(expenses, income, netUsd) {
  const expensesAmount = document.getElementById("summary-expenses-amount");
  const incomeAmount = document.getElementById("summary-income-amount");
  const balanceAmount = document.getElementById("summary-balance-amount");
  if (expensesAmount) expensesAmount.textContent = `${formatUsd(expenses.totalUsd)} $`;
  if (incomeAmount) incomeAmount.textContent = `${formatUsd(income.totalUsd)} $`;
  if (balanceAmount) balanceAmount.textContent = `${formatUsd(netUsd)} $`;

  const expensesMeta = document.getElementById("summary-expenses-meta");
  const incomeMeta = document.getElementById("summary-income-meta");
  const balanceMeta = document.getElementById("summary-balance-meta");
  const t = window.i18n?.t || ((k)=>k);
  if (expensesMeta) expensesMeta.textContent = expenses.count ? pluralizeOperations(expenses.count) : t('summary.noOperations');
  if (incomeMeta) incomeMeta.textContent = income.count ? pluralizeOperations(income.count) : t('summary.noOperations');
  if (balanceMeta) balanceMeta.textContent = netUsd === 0 ? t('summary.balanceUnchanged') : netUsd > 0 ? t('summary.surplus') : t('summary.deficit');

  const balanceCard = document.querySelector(".summary-card.balance");
  if (balanceCard) {
    balanceCard.classList.remove("positive", "negative");
    if (netUsd > 0) balanceCard.classList.add("positive");
    else if (netUsd < 0) balanceCard.classList.add("negative");
  }
}

async function loadSummaryStats() {
  const loading = document.getElementById("summary-loading");
  const empty = document.getElementById("summary-empty");
  if (loading) loading.hidden = false;
  if (empty) {
    empty.hidden = true;
  const t = window.i18n?.t || ((k)=>k);
  empty.textContent = t('summary.empty');
  }
  const params = new URLSearchParams();
  if (SUMMARY_PERIOD === "custom") {
    if (SUMMARY_FROM_MONTH) params.set("fromMonth", SUMMARY_FROM_MONTH);
    if (SUMMARY_TO_MONTH) params.set("toMonth", SUMMARY_TO_MONTH);
    params.set("period", "custom");
  } else {
    params.set("period", SUMMARY_PERIOD);
  }
  try {
    const data = await apiFetch(`/stats/summary?${params.toString()}`);
    const expenses = data.expenses || { totalUsd: 0, count: 0 };
    const income = data.income || { totalUsd: 0, count: 0 };
    const netUsd = Number(data.netUsd) || 0;
    const hasData = expenses.count || income.count || expenses.totalUsd || income.totalUsd;
    updateSummaryCards(expenses, income, netUsd);
    const label = document.getElementById("summary-period-label");
    if (label) label.textContent = formatRangeLabel(data.period);
    if (!hasData && empty) empty.hidden = false;
  } catch (err) {
    console.error("Failed to load summary stats", err);
    if (empty) {
  const t = window.i18n?.t || ((k)=>k);
  empty.textContent = t('message.loadError');
      empty.hidden = false;
    }
  } finally {
    if (loading) loading.hidden = true;
  }
}
async function openSettings() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  setBackupStatus("");
  const defaultWhoInput = document.getElementById("default-who-input");
  if (defaultWhoInput) defaultWhoInput.value = DEFAULT_WHO || "";
  const languageSelect = document.getElementById("settings-language");
  const activeLanguage = getActiveLanguage();
  SETTINGS_LANGUAGE_BASELINE = activeLanguage;
  SETTINGS_LANGUAGE_PENDING = activeLanguage;
  if (languageSelect) languageSelect.value = activeLanguage;
  const chartSelect = document.getElementById("settings-chart-type");
  if (chartSelect) chartSelect.value = CHART_TYPE;
  const categoryInput = document.getElementById("new-category-input");
  if (categoryInput) categoryInput.value = "";
  const currencyInput = document.getElementById("new-currency-input");
  if (currencyInput) currencyInput.value = "";
  const currencyRateInput = document.getElementById("new-currency-rate-input");
  if (currencyRateInput) currencyRateInput.value = "";
  ORIGINAL_CURRENCY_RATES = { ...(CONFIG?.currencyRates || {}) };
  renderCategorySettings();
  renderCurrencySettings();
  updateUsdPreview();
  renderBackupSettings();
  loadBackupConfigData({ silentStatus: true });
  loadBackupListData();
  // default to profile tab and notify listeners
  document.dispatchEvent(new Event("settings:open"));
  // ensure profile tab visible when opening
  const firstTab = document.querySelector('.settings-tab-headers .settings-tab[data-tab="profile"]');
  if (firstTab && typeof firstTab.click === 'function') firstTab.click();
  modal.style.display = "flex";
  modal.addEventListener(
    "click",
    (e) => {
      if (e.target === modal) closeSettings();
    },
    { once: true }
  );
}

async function closeSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.style.display = "none";
  if (CONFIG && ORIGINAL_CURRENCY_RATES) {
    CONFIG.currencyRates = { ...ORIGINAL_CURRENCY_RATES };
    renderCurrencySettings();
    updateUsdPreview();
  }
  ORIGINAL_CURRENCY_RATES = null;
  renderBackupSettings();
  setBackupStatus("");
  if (SETTINGS_LANGUAGE_BASELINE) {
    const currentLang = getActiveLanguage();
    if (currentLang !== SETTINGS_LANGUAGE_BASELINE) {
      try {
        await applyLanguage(SETTINGS_LANGUAGE_BASELINE);
      } catch (err) {
        console.error("Failed to revert language preview", err);
      }
      SETTINGS_LANGUAGE_PENDING = SETTINGS_LANGUAGE_BASELINE;
      const languageSelect = document.getElementById("settings-language");
      if (languageSelect) languageSelect.value = SETTINGS_LANGUAGE_BASELINE;
    }
  }
}

async function saveSettings() {
  const defaultWhoInput = document.getElementById("default-who-input");
  const languageSelect = document.getElementById("settings-language");
  const chartSelect = document.getElementById("settings-chart-type");
  const nextDefaultWho = (defaultWhoInput?.value || "").trim();
  const nextLanguage = languageSelect?.value || "en";
  const nextChartType = chartSelect?.value === "bar" ? "bar" : "pie";
  const ratesSaved = await saveCurrencyRates();
  if (!ratesSaved) return;
  const backupSaved = await saveBackupConfigFromUI();
  if (!backupSaved) return;
  try {
    await applyLanguage(nextLanguage);
  } catch (err) {
    console.error("Failed to switch language", err);
  }
  try {
    await apiFetch("/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultWho: nextDefaultWho, chartType: nextChartType, language: nextLanguage })
    });
  } catch (err) {
    console.error("Failed to save settings", err);
    alert(err?.message || getTranslation('message.settings.saveError', "Failed to save settings"));
    SETTINGS_LANGUAGE_PENDING = SETTINGS_LANGUAGE_BASELINE;
    if (languageSelect) languageSelect.value = SETTINGS_LANGUAGE_BASELINE;
    try {
      await applyLanguage(SETTINGS_LANGUAGE_BASELINE);
    } catch {}
    return;
  }
  DEFAULT_WHO = nextDefaultWho;
  CHART_TYPE = nextChartType;
  SETTINGS_LANGUAGE_BASELINE = nextLanguage;
  SETTINGS_LANGUAGE_PENDING = nextLanguage;
  await closeSettings();
  if (CURRENT_VIEW === "stats") loadCategoryStats();
}

async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch (err) {
    console.error("Failed to logout", err);
  }
  window.location.href = "/login";
}

function switchView(view) {
  CURRENT_VIEW = view;
  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}-view`);
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "stats") loadCategoryStats();
  if (view === "summary") loadSummaryStats();
  if (view === "transactions") applyView();
}

async function authAndPerAccount() {
  try {
    const data = await apiFetch("/me");
    CURRENT_USER = data?.username || "";
  } catch (err) {
    if (err?.status === 401) {
      window.location.href = "/login";
      return;
    }
    console.error("Failed to fetch user", err);
  }
  try {
    const data = await apiFetch("/settings", { headers: { Accept: "application/json" } });
    if (typeof data?.defaultWho === "string") DEFAULT_WHO = data.defaultWho;
    CHART_TYPE = data?.chartType === "bar" ? "bar" : "pie";
    const chartSelect = document.getElementById("settings-chart-type");
    if (chartSelect) chartSelect.value = CHART_TYPE;
    
    const userLanguage = data?.language || "en";
    try {
      await applyLanguage(userLanguage);
      SETTINGS_LANGUAGE_BASELINE = userLanguage;
      SETTINGS_LANGUAGE_PENDING = userLanguage;
    } catch (err) {
      console.error("Failed to apply user language", err);
    }
  } catch (err) {
    console.error("Failed to load settings", err);
    try {
      await applyLanguage("en");
      SETTINGS_LANGUAGE_BASELINE = "en";
      SETTINGS_LANGUAGE_PENDING = "en";
    } catch {}
  }
}

function initNavigation() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.view);
    });
  });
  switchView("transactions");
}

function initStatsControls() {
  document.querySelectorAll("[data-stats-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATS_PERIOD = btn.dataset.statsPeriod;
      if (STATS_PERIOD !== "custom") {
        STATS_FROM_MONTH = "";
        STATS_TO_MONTH = "";
        const from = document.getElementById("stats-from");
        const to = document.getElementById("stats-to");
        if (from) from.value = "";
        if (to) to.value = "";
      }
      setStatsPeriodActive();
      if (CURRENT_VIEW === "stats") loadCategoryStats();
    });
  });
  document.getElementById("stats-apply")?.addEventListener("click", () => {
    STATS_FROM_MONTH = document.getElementById("stats-from")?.value || "";
    STATS_TO_MONTH = document.getElementById("stats-to")?.value || "";
    STATS_PERIOD = "custom";
    setStatsPeriodActive();
    if (CURRENT_VIEW === "stats") loadCategoryStats();
  });
  setStatsPeriodActive();
}

function initSummaryControls() {
  document.querySelectorAll("[data-summary-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      SUMMARY_PERIOD = btn.dataset.summaryPeriod;
      if (SUMMARY_PERIOD !== "custom") {
        SUMMARY_FROM_MONTH = "";
        SUMMARY_TO_MONTH = "";
        const from = document.getElementById("summary-from");
        const to = document.getElementById("summary-to");
        if (from) from.value = "";
        if (to) to.value = "";
      }
      setSummaryPeriodActive();
      if (CURRENT_VIEW === "summary") loadSummaryStats();
    });
  });
  document.getElementById("summary-apply")?.addEventListener("click", () => {
    SUMMARY_FROM_MONTH = document.getElementById("summary-from")?.value || "";
    SUMMARY_TO_MONTH = document.getElementById("summary-to")?.value || "";
    SUMMARY_PERIOD = "custom";
    setSummaryPeriodActive();
    if (CURRENT_VIEW === "summary") loadSummaryStats();
  });
  setSummaryPeriodActive();
}
window.addEventListener("load", async () => {
  await Promise.all([fetchConfig(), authAndPerAccount()]);
  await loadWhoOptions();
  populateCategorySelects();
  populateCurrencySelects();
  populateWhoFilter();
  renderCategorySettings();
  renderCurrencySettings();
  setBaseActiveUI();
  updateFormMode({ editing: false });
  // Регистрация SW и запуск чекбокса
registerSW().then(async () => {
  await initNotifyToggle();
});


  // === Реактивное обновление при изменениях на сервере ===
function initRealtimeUpdates() {
  let protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.onopen = () => console.log("✅ Реальное обновление подключено");
  ws.onclose = () => {
    console.warn("⚠️ Соединение с сервером потеряно. Повторное подключение через 5 секунд...");
    setTimeout(initRealtimeUpdates, 5000);
  };
  ws.onerror = (err) => console.error("WebSocket error:", err);
  ws.onmessage = (e) => {
    if (e.data === "update") {
      console.log("🔁 Обновление данных по WebSocket");
      loadData();
      loadWhoOptions(true);
    }
  };
}

initRealtimeUpdates();


  document.getElementById("exp")?.addEventListener("click", () => switchBase("expenses"));
  document.getElementById("inc")?.addEventListener("click", () => switchBase("income"));

  const openNew = () => {
    editingId = null;
    setDeleteButtonVisibility(false);
    const form = document.getElementById("edit-form");
    form?.reset();
    document.getElementById("f-who").value = DEFAULT_WHO || "";
    const dateInput = document.getElementById("f-date");
    if (dateInput) dateInput.value = toInputDateTime(new Date());
    const usdNode = document.getElementById("f-usd-display");
    if (usdNode) usdNode.textContent = "-";
    updateFormMode({ editing: false });
    const categorySelect = document.getElementById("f-categories");
    if (categorySelect) {
      if (current === "income") {
        ensureIncomeOption(categorySelect);
        categorySelect.value = INCOME_CATEGORY_VALUE;
      } else {
        categorySelect.selectedIndex = categorySelect.options.length ? 0 : -1;
      }
    }
    updateUsdPreview();
    openModal();
  };

  document.getElementById("add-btn")?.addEventListener("click", openNew);
  document.getElementById("fab-add")?.addEventListener("click", openNew);
  document.getElementById("f-amount")?.addEventListener("input", updateUsdPreview);
  document.getElementById("f-currency")?.addEventListener("change", updateUsdPreview);

  document.getElementById("modal")?.addEventListener("click", (e) => {
    if (e.target.id === "modal") {
      closeModal();
      editingId = null;
      setDeleteButtonVisibility(false);
      updateFormMode({ editing: false });
    }
  });

  document.getElementById("details-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "details-modal") closeDetails();
  });

  document.getElementById("flt-apply")?.addEventListener("click", () => {
    resetPaging();
    loadData();
  });

  document.getElementById("flt-reset")?.addEventListener("click", () => {
    document.querySelectorAll(".filters select, .filters input").forEach((el) => {
      if (el.tagName === "SELECT" || el.type === "text" || el.type === "datetime-local") {
        el.value = "";
      }
    });
    PERIOD = null;
    setPeriodActive(null);
    resetPaging();
    loadData();
  });

  document.getElementById("view-list")?.addEventListener("click", () => {
    VIEW_MODE = "table";
    setToggleActive("list");
    applyView();
  });
  document.getElementById("view-cards")?.addEventListener("click", () => {
    VIEW_MODE = "cards";
    setToggleActive("cards");
    applyView();
  });
  window.addEventListener("resize", () => {
    if (VIEW_MODE === "auto") applyView();
  });

  document.getElementById("page-size")?.addEventListener("change", (event) => {
    const val = event.target.value;
    LOAD_ALL = val === "all";
    PAGE_SIZE = LOAD_ALL ? 100 : parseInt(val, 10) || 20;
    resetPaging();
    loadData();
  });

  document.getElementById("prev-page")?.addEventListener("click", () => {
    if (LOAD_ALL || CURRENT_PAGE <= 1) return;
    CURSOR_STACK.pop();
    CURRENT_CURSOR = CURSOR_STACK.length ? CURSOR_STACK[CURSOR_STACK.length - 1] : null;
    CURRENT_PAGE -= 1;
    loadData();
  });

  document.getElementById("next-page")?.addEventListener("click", () => {
    if (LOAD_ALL || !NEXT_CURSOR) return;
    CURSOR_STACK.push(NEXT_CURSOR);
    CURRENT_CURSOR = NEXT_CURSOR;
    CURRENT_PAGE += 1;
    loadData();
  });

  document.getElementById("period-today")?.addEventListener("click", () => {
    PERIOD = "today";
    setPeriodActive("today");
    document.getElementById("flt-date-from").value = "";
    document.getElementById("flt-date-to").value = "";
    resetPaging();
    loadData();
  });
  document.getElementById("period-week")?.addEventListener("click", () => {
    PERIOD = "last_week";
    setPeriodActive("week");
    document.getElementById("flt-date-from").value = "";
    document.getElementById("flt-date-to").value = "";
    resetPaging();
    loadData();
  });
  document.getElementById("period-month")?.addEventListener("click", () => {
    PERIOD = "last_30_days";
    setPeriodActive("month");
    document.getElementById("flt-date-from").value = "";
    document.getElementById("flt-date-to").value = "";
    resetPaging();
    loadData();
  });

  document.getElementById("flt-date-from")?.addEventListener("input", () => {
    PERIOD = null;
    setPeriodActive(null);
  });
  document.getElementById("flt-date-to")?.addEventListener("input", () => {
    PERIOD = null;
    setPeriodActive(null);
  });

  document.getElementById("cancel-btn")?.addEventListener("click", () => {
    closeModal();
    editingId = null;
    setDeleteButtonVisibility(false);
    setStatus("");
  });

  document.getElementById("delete-btn")?.addEventListener("click", async () => {
    if (!editingId) return;
    if (await deleteRecord(editingId, { showStatus: true })) {
      editingId = null;
      setDeleteButtonVisibility(false);
      closeModal();
      await loadData();
      await loadWhoOptions(true);
    }
  });

  document.getElementById("edit-form").onsubmit = async (event) => {
    event.preventDefault();
    setStatus("Сохранение...");
    const payload = readForm();
    const url = editingId ? `/api/${current}/${editingId}` : `/api/${current}`;
    const method = editingId ? "PATCH" : "POST";
    try {
      await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus("");
      ensureWhoOption(payload.who);
      editingId = null;
      event.target.reset();
      setDeleteButtonVisibility(false);
      closeModal();
      await loadData();
    } catch (err) {
      setStatus("");
      alert(err?.message || "Не удалось сохранить запись");
      console.error("Failed to submit form", err);
    }
  };

  document.getElementById("settings-btn")?.addEventListener("click", openSettings);
  document.getElementById("settings-save")?.addEventListener("click", async (e) => {
    e?.preventDefault();
    await saveSettings();
  });
  document.getElementById("settings-cancel")?.addEventListener("click", closeSettings);
  document.getElementById("settings-logout")?.addEventListener("click", logout);
  initSettingsControls();
  initSettingsTabs();

  initNavigation();
  initStatsControls();
  initSummaryControls();
  applyView();
  resetPaging();
  await loadData();
});



// === Notifications & Service Worker helpers ===
async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js", { scope: "/" }); }
  catch { return null; }
}
async function ensureNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied")  return false;
  try { return (await Notification.requestPermission()) === "granted"; } catch { return false; }
}
function urlBase64ToUint8Array(b64){
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64); const out = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}
async function getPushSub() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await apiFetch("/push/publicKey");
    if (!key) return;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await apiFetch("/push/subscribe", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(sub) });
  } catch(e){ console.warn("push subscribe failed:", e); }
}
function sendLocalNotification({ title, body, data }) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (navigator.serviceWorker && "BroadcastChannel" in window) {
    new BroadcastChannel("finance-events").postMessage({ title, body, data });
  } else {
    try { new Notification(title, { body }); } catch {}
  }
}

async function unsubscribePush() {
  try {
    const sub = await getPushSub();
    if (sub) {
      await apiFetch("/push/unsubscribe", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint })
      });
      await sub.unsubscribe();
    }
  } catch {}
}

async function initNotifyToggle() {
  const el = document.getElementById("notifyToggle");
  if (!el) return;

  // стартовое состояние из localStorage
  el.checked = localStorage.getItem("notifyEnabled") === "1";
  el.disabled = false;

  // если включено, но подписки нет — подписываемся
  if (el.checked) {
    const sub = await getPushSub();
    if (!sub) {
      const ok = await ensureNotifPermission();
      if (ok) {
        await subscribeToPush();
        el.checked = Boolean(await getPushSub());
        localStorage.setItem("notifyEnabled", el.checked ? "1" : "0");
      } else {
        el.checked = false;
        localStorage.setItem("notifyEnabled", "0");
      }
    }
  }

  // обработчик изменений
  el.addEventListener("change", async () => {
    if (el.checked) {
      const ok = await ensureNotifPermission();
      if (!ok) { el.checked = false; localStorage.setItem("notifyEnabled","0"); return; }
      await subscribeToPush();
      el.checked = Boolean(await getPushSub());
      localStorage.setItem("notifyEnabled", el.checked ? "1" : "0");
    } else {
      await unsubscribePush();
      el.checked = false;
      localStorage.setItem("notifyEnabled", "0");
    }
  });

  // при открытии модалки полезно синхронизировать реальное состояние
  document.addEventListener("settings:open", async () => {
    const sub = await getPushSub();
    const perm = ("Notification" in window) ? Notification.permission : "denied";
    el.checked = (perm === "granted") && Boolean(sub);
    localStorage.setItem("notifyEnabled", el.checked ? "1" : "0");
  });
}


// Autoregister on load
window.addEventListener("load", () => {
  registerSW().then(async () => {
    const ok = await ensureNotifPermission();
    if (ok) await subscribeToPush();
    
  });
});
