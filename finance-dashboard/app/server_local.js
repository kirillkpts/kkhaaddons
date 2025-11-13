import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import sessionFileStore from "session-file-store";
import dotenv from "dotenv";
import { promises as fs, watch } from "fs";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const SUPPORTED_LANGUAGES = ["en", "ru"];
const DEFAULT_LANGUAGE = "en";
const SERVER_MESSAGES = {
  en: {
    server_error: "Unexpected server error",
    missing_credentials: "Missing credentials",
    invalid_credentials: "Invalid credentials",
    session_create_failed: "Failed to create session",
    auth_required: "Authentication required",
    settings_load_failed: "Failed to load settings",
    settings_save_failed: "Failed to save settings",
    config_load_failed: "Failed to load configuration",
    categories_load_failed: "Failed to fetch categories",
    category_name_required: "Category name cannot be empty",
    category_exists: "Category already exists",
    category_add_failed: "Failed to add category",
    category_not_found: "Category not found",
    category_delete_failed: "Failed to delete category",
    currencies_load_failed: "Failed to fetch currencies",
    currency_code_required: "Currency code cannot be empty",
    currency_exists: "Currency already exists",
    currency_add_failed: "Failed to add currency",
    currency_not_found: "Currency not found",
    currency_delete_failed: "Failed to delete currency",
    currency_rates_payload_invalid: "Currency rate payload is invalid",
    currency_rates_update_failed: "Failed to update currency rates",
    backup_settings_load_failed: "Failed to load backup settings",
    backup_settings_save_failed: "Failed to save backup settings",
    backup_script_missing: "Backup script URL is not configured",
    backup_list_failed: "Failed to load backup list",
    backup_delete_failed: "Failed to delete backup",
    backup_create_failed: "Failed to create backup",
    backup_restore_failed: "Failed to restore backup",
    backup_name_required: "Backup name is required",
    backup_response_invalid: "Backup service response is invalid",
    backup_database_missing: "Backup payload does not contain database",
    options_load_failed: "Failed to load options",
    stats_categories_failed: "Failed to load category stats",
    stats_summary_failed: "Failed to load summary stats",
    records_list_failed: "Failed to list records",
    record_create_failed: "Failed to create record",
    amount_required: "Amount must be greater than zero",
    invalid_id: "Invalid id",
    not_found: "Record not found",
    record_update_failed: "Failed to update record",
    record_delete_failed: "Failed to delete record",
    text_required: "Text is required",
    push_income_title: "Income added",
    push_expense_title: "Expense added",
    debug_push_title: "Push test",
    debug_push_body: "Web Push verification"
  },
  ru: {
    server_error: "Неизвестная ошибка сервера",
    missing_credentials: "Не указаны учетные данные",
    invalid_credentials: "Неверное имя пользователя или пароль",
    session_create_failed: "Не удалось создать сессию",
    auth_required: "Требуется авторизация",
    settings_load_failed: "Не удалось загрузить настройки",
    settings_save_failed: "Не удалось сохранить настройки",
    config_load_failed: "Не удалось загрузить конфигурацию",
    categories_load_failed: "Не удалось получить категории",
    category_name_required: "Название категории не может быть пустым",
    category_exists: "Такая категория уже существует",
    category_add_failed: "Не удалось добавить категорию",
    category_not_found: "Категория не найдена",
    category_delete_failed: "Не удалось удалить категорию",
    currencies_load_failed: "Не удалось получить валюты",
    currency_code_required: "Код валюты не может быть пустым",
    currency_exists: "Такая валюта уже существует",
    currency_add_failed: "Не удалось добавить валюту",
    currency_not_found: "Валюта не найдена",
    currency_delete_failed: "Не удалось удалить валюту",
    currency_rates_payload_invalid: "Некорректные данные курсов валют",
    currency_rates_update_failed: "Не удалось обновить курсы валют",
    backup_settings_load_failed: "Не удалось загрузить настройки резервного копирования",
    backup_settings_save_failed: "Не удалось сохранить настройки резервного копирования",
    backup_script_missing: "URL скрипта резервного копирования не настроен",
    backup_list_failed: "Не удалось получить список резервных копий",
    backup_delete_failed: "Не удалось удалить резервную копию",
    backup_create_failed: "Не удалось создать резервную копию",
    backup_restore_failed: "Не удалось восстановить резервную копию",
    backup_name_required: "Не указано имя резервной копии",
    backup_response_invalid: "Некорректный ответ сервиса резервного копирования",
    backup_database_missing: "В резервной копии отсутствует база данных",
    options_load_failed: "Не удалось загрузить варианты",
    stats_categories_failed: "Не удалось загрузить статистику категорий",
    stats_summary_failed: "Не удалось загрузить сводную статистику",
    records_list_failed: "Не удалось загрузить записи",
    record_create_failed: "Не удалось создать запись",
    amount_required: "Сумма должна быть больше нуля",
    invalid_id: "Некорректный идентификатор",
    not_found: "Запись не найдена",
    record_update_failed: "Не удалось обновить запись",
    record_delete_failed: "Не удалось удалить запись",
    text_required: "Текст обязателен",
    push_income_title: "Добавлен доход",
    push_expense_title: "Добавлен расход",
    debug_push_title: "Тестовое уведомление",
    debug_push_body: "Проверка Web Push"
  }
};

function createAppError(code = "server_error", status = 500) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeLanguageCode(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : null;
}

function parseAcceptLanguage(header) {
  if (!header || typeof header !== "string") return null;
  const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const [langPart] = part.split(";").map((segment) => segment.trim());
    const normalized = normalizeLanguageCode(langPart);
    if (normalized) return normalized;
  }
  return null;
}

function getRequestLanguage(req) {
  const fromSession = normalizeLanguageCode(req?.session?.language);
  if (fromSession) return fromSession;
  const fromHeader = parseAcceptLanguage(req?.get?.("accept-language"));
  if (fromHeader) return fromHeader;
  return DEFAULT_LANGUAGE;
}

function translateServerMessage(langOrReq, key, fallback) {
  const lang = typeof langOrReq === "string" ? normalizeLanguageCode(langOrReq) || DEFAULT_LANGUAGE : getRequestLanguage(langOrReq);
  const bundle = SERVER_MESSAGES[lang] || SERVER_MESSAGES[DEFAULT_LANGUAGE];
  return bundle[key] || SERVER_MESSAGES[DEFAULT_LANGUAGE][key] || fallback || key;
}

function respondWithError(req, res, status, key = "server_error", fallback) {
  const message = translateServerMessage(req, key, fallback);
  return res.status(status).json({ error: message, code: key });
}

function handleRouteError(req, res, err, fallbackKey = "server_error", logLabel) {
  const status = err?.status || 500;
  const key = err?.code || fallbackKey;
  if (status >= 500 && logLabel) {
    console.error(logLabel, err);
  } else if (status >= 500) {
    console.error(err);
  }
  return respondWithError(req, res, status, key, err?.message);
}

function setSessionLanguage(req, lang) {
  const normalized = normalizeLanguageCode(lang);
  if (req?.session && normalized) {
    req.session.language = normalized;
  }
}

// --- Web Push dynamic import and setup ---
let webpush = null;
try {
  const m = await import("web-push");
  webpush = m.default || m;
  console.log("[push] web-push loaded");
} catch {
  console.warn("[push] web-push NOT installed");
}
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
if (webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
console.log("[push] VAPID_PUBLIC_KEY length:", (VAPID_PUBLIC_KEY||"").length);
// Simple file-based subscription store
const PUSH_DB = "/data/push_subs.json";
async function readSubs(){
  try{
    const raw = await fs.readFile(PUSH_DB,"utf8");
    return JSON.parse(raw);
  }catch{
    return [];
  }
}
async function writeSubs(list){
  await fs.mkdir(path.dirname(PUSH_DB), { recursive: true });
  await fs.writeFile(PUSH_DB, JSON.stringify(list,null,2));
}
async function sendPushAll(payload){
  if (!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] disabled: lib/keys missing");
    return;
  }
  const subs = await readSubs();
  if (!subs.length) { console.warn("[push] no subscriptions"); return; }
  console.log("[push] sending to", subs.length, "subs");
  await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(sub, JSON.stringify(payload)).catch(err => {
      console.warn("[push] send fail:", err?.statusCode);
    }))
  );
}


const FileStore = sessionFileStore(session);

dotenv.config();

const app = express();
app.use(bodyParser.json());

function parseAuthUsers() {
  const raw = process.env.AUTH_USERS || "";
  const map = new Map();
  raw.split(",").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      const u = pair.slice(0, idx);
      const p = pair.slice(idx + 1);
      map.set(u, p);
    }
  });
  if (!map.size && process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    map.set(process.env.ADMIN_USER, process.env.ADMIN_PASS);
  }
  return map;
}
const AUTH_USERS = parseAuthUsers();

const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-session-secret";
const DEFAULT_SESSION_MAX_AGE = 1000 * 60 * 60 * 4;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "finance.sid";
const WHO_CACHE_TTL = 1000 * 60 * 5;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_HTML_PATH = path.join(__dirname, "public", "index.html");

const lookupCache = {
  categories: null,
  currencies: null
};
function resetLookupCaches() {
  lookupCache.categories = null;
  lookupCache.currencies = null;
}
function invalidateCategoriesCache() {
  lookupCache.categories = null;
}
function invalidateCurrenciesCache() {
  lookupCache.currencies = null;
}

let indexTemplate = "";
let indexTemplateWatcherReady = false;
async function loadIndexTemplate(force = false) {
  if (!force && indexTemplate) return indexTemplate;
  indexTemplate = await fs.readFile(INDEX_HTML_PATH, "utf8");
  return indexTemplate;
}
function watchIndexTemplate() {
  if (indexTemplateWatcherReady) return;
  indexTemplateWatcherReady = true;
  try {
    watch(INDEX_HTML_PATH, { persistent: false }, () => {
      loadIndexTemplate(true)
        .then(() => console.log("[index] template cache refreshed"))
        .catch((err) => console.error("Failed to refresh index template cache", err));
    });
  } catch (err) {
    console.warn("Unable to watch index.html for changes", err);
  }
}
try {
  await loadIndexTemplate(true);
} catch (err) {
  console.warn("Failed to warm index template cache", err);
}
watchIndexTemplate();

// длительности
const SHORT_MS = 1000 * 60 * 60 * 4;        // 4 часа
const LONG_MS  = 1000 * 60 * 60 * 24 * 30;  // 30 дней

// Путь хранилища — в /data (persist в HA)
const ACCESS_TOKEN = (process.env.ACCESS_TOKEN || "").trim();
const SESSION_DIR = process.env.SESSION_STORE_PATH || "/data/sessions";
await fs.mkdir(SESSION_DIR, { recursive: true });

const sessionStore = new FileStore({
  path: SESSION_DIR,
  retries: 0,
  ttl: Math.floor(LONG_MS / 1000)
});


app.set("trust proxy", 1); // если за прокси/HTTPS

app.use(session({
  name: SESSION_COOKIE_NAME || "finance.sid",
  secret: SESSION_SECRET || "change-me",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto",
    maxAge: SHORT_MS
  }
}));

// продление maxAge на каждом запросе
app.use((req, _res, next) => {
  if (req.session?.user) {
    const max = req.session.remember ? LONG_MS : SHORT_MS;
    if (req.session.cookie.maxAge !== max) req.session.cookie.maxAge = max;
    req.session.touch();
  }
  next();
});


const TOKEN_PATH_PATTERNS = [/^\/api(\/|$)/, /^\/backup(\/|$)/, /^\/options(\/|$)/];

function extractAccessToken(req) {
  const headerToken = req.get("x-access-token");
  if (headerToken && headerToken.trim()) return headerToken.trim();
  const authHeader = req.get("authorization");
  if (authHeader) {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7).trim();
    }
    return trimmed;
  }
  if (req.query && typeof req.query.access_token === "string") {
    return req.query.access_token.trim();
  }
  return null;
}

function hasValidAccessToken(req) {
  if (!ACCESS_TOKEN) return false;
  const provided = extractAccessToken(req);
  return Boolean(provided && provided === ACCESS_TOKEN);
}

function tokenAllowedForPath(pathname = "") {
  return TOKEN_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

const SETTINGS_PATH = process.env.USER_SETTINGS_PATH || path.join(__dirname, "user-settings.json");

async function loadSettingsFile() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (parseErr) {
      console.error("Failed to parse settings file", parseErr);
      return {};
    }
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeSettingsFile(allSettings) {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  const tmp = `${SETTINGS_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(allSettings, null, 2), "utf8");
  await fs.rename(tmp, SETTINGS_PATH);
}

async function removeFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error(`Failed to remove file ${filePath}`, err);
    }
  }
}

async function getUserSettingsValue(username) {
  const all = await loadSettingsFile();
  const settings = all?.[username] || {};
  return {
    defaultWho: typeof settings.defaultWho === "string" ? settings.defaultWho : "",
    chartType: settings.chartType === "bar" ? "bar" : "pie",
    language: typeof settings.language === "string" ? settings.language : "en"
  };
}

async function updateUserSettingsValue(username, patch) {
  const all = await loadSettingsFile();
  const current = all?.[username] || {};
  const next = { ...current, ...patch };
  all[username] = next;
  await writeSettingsFile(all);
  return {
    defaultWho: typeof next.defaultWho === "string" ? next.defaultWho : "",
    chartType: next.chartType === "bar" ? "bar" : "pie",
    language: typeof next.language === "string" ? next.language : "en"
  };
}

app.get(["/login", "/login/"], (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/login.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.js"));
});
app.get("/style.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "style.css"));
});

app.get("/me", (req, res) => {
  res.json({ username: (req.session && req.session.user) || "" });
});

app.post("/auth/login", (req, res) => {
  const { username, password, remember } = req.body || {};
  if (!username || !password) return respondWithError(req, res, 400, "missing_credentials");
  if (!AUTH_USERS.has(username) || AUTH_USERS.get(username) !== password) {
    return respondWithError(req, res, 401, "invalid_credentials");
  }
  const persistent = Boolean(remember);
  req.session.regenerate((err) => {
    if (err) {
      console.error("Failed to regenerate session", err);
      return respondWithError(req, res, 500, "session_create_failed");
    }
    req.session.user = username;
    req.session.remember = Boolean(remember);
    req.session.cookie.maxAge = req.session.remember ? LONG_MS : SHORT_MS;
    res.json({ ok: true, username, remember: req.session.remember });
  });
});
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (tokenAllowedForPath(req.path) && hasValidAccessToken(req)) return next();
  if (req.accepts(["html"])) return res.redirect("/login");
  return respondWithError(req, res, 401, "auth_required");
}

app.use(requireAuth);
// Lazy prerender index with user language and initial data
app.get("/", async (req, res) => {
  try {
    const user = req.session?.user || "";
    const settings = await getUserSettingsValue(user);
    const lang = settings.language || "en";
    setSessionLanguage(req, lang);
    const { currencies, currencyRates } = getCurrenciesPayload();
    const categories = listCategories();
    // initial list payload (expenses, default sort by date desc, page size 20)
    const { sql, params, limit, nextOffset } = buildListQuery("expenses", { limit: 20, sortKey: "date", sortDir: "desc" });
    const rows = db.prepare(sql).all(params);
    const results = rows.map(rowToPage);
    const has_more = rows.length === limit;
    const initial = { results, has_more, next_cursor: has_more ? String(nextOffset) : null };

    const bootstrap = {
      lang,
      config: { props: PROP, categories, currencies, currencyRates },
      initial
    };

    const template = await loadIndexTemplate();
    let html = template;
    // Hide until translations applied
    const styleTag = "<style>html:not([data-ready]){visibility:hidden}</style>";
    html = html.replace(/<\/head>/i, `${styleTag}\n</head>`);
    // Inject language bundle and bootstrap before app.js
    const coreScriptRe = /(\<script[^>]*src=[\"\']i18n-core\.js[\"\'][^>]*>\s*<\/script>)/i;
    const langScript = `\n<script src="i18n.${lang}.js"></script>\n<script>window.__BOOTSTRAP__=${JSON.stringify(bootstrap)};window.i18n&&window.i18n.setLanguage(${JSON.stringify(lang)});</script>`;
    html = html.replace(coreScriptRe, `$1${langScript}`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Failed to prerender index", err);
    return res.sendFile(INDEX_HTML_PATH);
  }
});

app.use(express.static("public"));

app.get("/settings", async (req, res) => {
  try {
    const settings = await getUserSettingsValue(req.session.user);
    if (settings?.language) setSessionLanguage(req, settings.language);
    res.json(settings);
  } catch (err) {
    handleRouteError(req, res, err, "settings_load_failed", "Failed to load settings");
  }
});

app.post("/settings", async (req, res) => {
  try {
    const payload = req.body || {};
    const chartType = payload.chartType === "bar" ? "bar" : "pie";
    const language = typeof payload.language === "string" ? payload.language : "en";
    const updated = await updateUserSettingsValue(req.session.user, {
      defaultWho: typeof payload.defaultWho === "string" ? payload.defaultWho : "",
      chartType,
      language
    });
    setSessionLanguage(req, language);
    res.json({ ok: true, settings: updated });
  } catch (err) {
    handleRouteError(req, res, err, "settings_save_failed", "Failed to save settings");
  }
});

const PROP = {
  description: process.env.DESC_PROP || "description",
  categories: process.env.CATS_PROP || "category",
  amount: process.env.AMOUNT_PROP || "amount",
  currency: process.env.CURRENCY_PROP || "currency",
  date: process.env.DATE_PROP || "date",
  who: process.env.WHO_PROP || "who",
  usdAmount: process.env.USD_AMOUNT_PROP || "usd_amount"
};

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "finance.db");
const DB_WAL_PATH = `${DB_PATH}-wal`;
const DB_SHM_PATH = `${DB_PATH}-shm`;

const DEFAULT_CATEGORIES = [
  "Groceries",
  "Transport",
  "Housing",
  "Internet",
  "Health",
  "Education",
  "Gifts",
  "Travel",
  "Entertainment",
  "Home",
  "Clothing",
  "Kids",
  "Beauty",
  "Taxes",
  "Other"
];
const DEFAULT_CURRENCY_RATES = {
  USD: 1,
  RUB: 1,
  EUR: 1,
  KZT: 1,
  BYN: 1,
  UAH: 1
};
const DEFAULT_CURRENCIES = Object.keys(DEFAULT_CURRENCY_RATES);
const DATE_COLUMN_SQL = "COALESCE(date_local, substr(date,1,10))";

let db;
let selectCurrencyRateStmt = null;

function refreshPreparedStatements(database) {
  const target = database || db;
  if (!target) return;
  selectCurrencyRateStmt = target.prepare("SELECT rate FROM currencies WHERE code = ?");
}

function ensureSchema(database) {
  const target = database || db;
  if (!target) return;
  target.exec(`
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('expenses','income')),
  description TEXT,
  category TEXT,
  amount REAL,
  currency TEXT,
  date TEXT,
  date_local TEXT,
  who TEXT,
  usd_amount REAL
);
CREATE INDEX IF NOT EXISTS idx_records_type_date ON records(type, date);
CREATE INDEX IF NOT EXISTS idx_records_type_category ON records(type, category);
CREATE INDEX IF NOT EXISTS idx_records_type_who ON records(type, who);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  rate REAL NOT NULL DEFAULT 1
);
`);
  const currencyTableInfo = target.prepare("PRAGMA table_info(currencies)").all();
  if (!currencyTableInfo.some((col) => col.name === "rate")) {
    target.prepare("ALTER TABLE currencies ADD COLUMN rate REAL NOT NULL DEFAULT 1").run();
  }
  const recordsTableInfo = target.prepare("PRAGMA table_info(records)").all();
  if (!recordsTableInfo.some((col) => col.name === "date_local")) {
    target.prepare("ALTER TABLE records ADD COLUMN date_local TEXT").run();
  }
  target.prepare(`
    UPDATE records
    SET date_local = COALESCE(strftime('%Y-%m-%d', datetime(date, 'localtime')), substr(date, 1, 10))
    WHERE date IS NOT NULL
  `).run();
  target.exec("CREATE INDEX IF NOT EXISTS idx_records_type_date_local ON records(type, date_local)");
}

function initDatabase() {
  const database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  ensureSchema(database);
  ensureDefaultLookups(database);
  refreshPreparedStatements(database);
  return database;
}

db = initDatabase();
resetLookupCaches();

function normalizeLookupValue(value, { upperCase = false } = {}) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  if (upperCase) next = next.toUpperCase();
  if (next.length > 100) next = next.slice(0, 100);
  return next;
}

function normalizeRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return Math.round(rate * 1e6) / 1e6;
}

function ensureDefaultLookups(database) {
  const target = database || db;
  if (!target) return;
  const categoryCount = target.prepare("SELECT COUNT(*) AS count FROM categories").get().count || 0;
  if (categoryCount === 0) {
    const insertCategory = target.prepare("INSERT INTO categories(name) VALUES (?)");
    DEFAULT_CATEGORIES.forEach((name) => insertCategory.run(name));
  }

  const currencyRows = target.prepare("SELECT code, rate FROM currencies").all();
  if (currencyRows.length === 0) {
    const insertCurrency = target.prepare("INSERT INTO currencies(code, rate) VALUES (?, ?)");
    DEFAULT_CURRENCIES.forEach((code) => {
      const rate = normalizeRate(DEFAULT_CURRENCY_RATES[code]);
      insertCurrency.run(code, rate);
    });
  } else {
    const fixInvalidRates = target.prepare("UPDATE currencies SET rate = 1 WHERE rate IS NULL OR rate <= 0");
    fixInvalidRates.run();
  }
}

function listCategories() {
  if (Array.isArray(lookupCache.categories)) {
    return lookupCache.categories.slice();
  }
  const rows = db.prepare("SELECT name FROM categories ORDER BY name COLLATE NOCASE").all().map((row) => row.name);
  lookupCache.categories = rows;
  return rows.slice();
}

function getCurrenciesPayload() {
  if (lookupCache.currencies) {
    return {
      currencies: lookupCache.currencies.currencies.slice(),
      currencyRates: { ...lookupCache.currencies.currencyRates }
    };
  }
  const rows = db.prepare("SELECT code, rate FROM currencies ORDER BY code COLLATE NOCASE").all();
  const currencies = [];
  const currencyRates = {};
  rows.forEach(({ code, rate }) => {
    const normalizedCode = normalizeLookupValue(code, { upperCase: true });
    if (!normalizedCode) return;
    const normalizedRate = normalizeRate(rate);
    currencies.push(normalizedCode);
    currencyRates[normalizedCode] = normalizedRate;
  });
  lookupCache.currencies = { currencies, currencyRates };
  return { currencies: currencies.slice(), currencyRates: { ...currencyRates } };
}

function addCategory(name) {
  const value = normalizeLookupValue(name);
  if (!value) throw createAppError("category_name_required", 400);
  try {
    db.prepare("INSERT INTO categories(name) VALUES (?)").run(value);
  } catch (err) {
    if (err && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createAppError("category_exists", 409);
    }
    throw err;
  }
  invalidateCategoriesCache();
  return listCategories();
}

function removeCategory(name) {
  const value = normalizeLookupValue(name);
  if (!value) return false;
  const result = db.prepare("DELETE FROM categories WHERE name = ?").run(value);
  if (result.changes > 0) {
    db.prepare("UPDATE records SET category = NULL WHERE category = ?").run(value);
    invalidateCategoriesCache();
    return true;
  }
  return false;
}

function addCurrency(code, rate) {
  const value = normalizeLookupValue(code, { upperCase: true });
  if (!value) throw createAppError("currency_code_required", 400);
  const normalizedRate = normalizeRate(rate);
  try {
    db.prepare("INSERT INTO currencies(code, rate) VALUES (?, ?)").run(value, normalizedRate);
  } catch (err) {
    if (err && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createAppError("currency_exists", 409);
    }
    throw err;
  }
  invalidateCurrenciesCache();
  return getCurrenciesPayload();
}

function removeCurrency(code) {
  const value = normalizeLookupValue(code, { upperCase: true });
  if (!value) return false;
  const result = db.prepare("DELETE FROM currencies WHERE code = ?").run(value);
  if (result.changes > 0) {
    db.prepare("UPDATE records SET currency = NULL WHERE currency = ?").run(value);
    invalidateCurrenciesCache();
    return true;
  }
  return false;
}

function setCurrencyRates(rates) {
  if (!rates || typeof rates !== "object") {
    throw createAppError("currency_rates_payload_invalid", 400);
  }
  const entries = Object.entries(rates);
  const update = db.prepare("UPDATE currencies SET rate = ? WHERE code = ?");
  const tx = db.transaction((items) => {
    items.forEach(([code, rawRate]) => {
      const normalizedCode = normalizeLookupValue(code, { upperCase: true });
      if (!normalizedCode) return;
      const normalizedRate = normalizeRate(rawRate);
      update.run(normalizedRate, normalizedCode);
    });
  });
  tx(entries);
  invalidateCurrenciesCache();
  return getCurrenciesPayload();
}

function getCurrencyRate(code) {
  const normalizedCode = normalizeLookupValue(code, { upperCase: true });
  if (!normalizedCode || normalizedCode === "USD") return 1;
  try {
    if (!selectCurrencyRateStmt) refreshPreparedStatements();
    const row = selectCurrencyRateStmt?.get(normalizedCode);
    if (!row || row.rate == null) return 1;
    return normalizeRate(row.rate);
  } catch {
    return 1;
  }
}

const BACKUP_CONFIG_PATH = process.env.BACKUP_CONFIG_PATH || path.join(__dirname, "backup-config.json");
const DEFAULT_BACKUP_SCRIPT_URL = (process.env.BACKUP_SCRIPT_URL || "").trim();
const FALLBACK_BACKUP_RUN_TIME = "03:00";
const BACKUP_TIME_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_BACKUP_RUN_TIME = normalizeBackupRunTime(process.env.BACKUP_RUN_TIME || FALLBACK_BACKUP_RUN_TIME);

let backupConfig = null;
let autoBackupTimer = null;

function mergeBackupConfig(input = {}) {
  const scriptUrl = DEFAULT_BACKUP_SCRIPT_URL;
  return {
    scriptUrl,
    autoEnabled: scriptUrl ? Boolean(input.autoEnabled) : false,
    lastRunAt: input.lastRunAt || null,
    runTime: normalizeBackupRunTime(input.runTime || DEFAULT_BACKUP_RUN_TIME)
  };
}

async function loadBackupConfig() {
  try {
    const raw = await fs.readFile(BACKUP_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return mergeBackupConfig(parsed);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error("Failed to read backup config", err);
    }
    return mergeBackupConfig();
  }
}

async function persistBackupConfig(next, { reschedule = true } = {}) {
  backupConfig = mergeBackupConfig({ ...(backupConfig || {}), ...(next || {}) });
  try {
    await fs.mkdir(path.dirname(BACKUP_CONFIG_PATH), { recursive: true });
    await fs.writeFile(BACKUP_CONFIG_PATH, JSON.stringify(backupConfig, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save backup config", err);
  }
  if (reschedule) scheduleAutoBackupTimer();
  return backupConfig;
}

function getBackupScriptUrl() {
  return (backupConfig?.scriptUrl || "").trim();
}

function normalizeBackupRunTime(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  const match = candidate.match(BACKUP_TIME_REGEX);
  if (!match) return FALLBACK_BACKUP_RUN_TIME;
  const hours = String(match[1]).padStart(2, "0");
  const minutes = String(match[2]).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getRunTimeParts(runTime = DEFAULT_BACKUP_RUN_TIME) {
  const normalized = normalizeBackupRunTime(runTime);
  const [hours, minutes] = normalized.split(":").map((part) => parseInt(part, 10));
  return { hours, minutes };
}

function getLastScheduledTimestamp(nowTs = Date.now(), runTime = DEFAULT_BACKUP_RUN_TIME) {
  const { hours, minutes } = getRunTimeParts(runTime);
  const now = new Date(nowTs);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);
  if (scheduled.getTime() > nowTs) {
    scheduled.setDate(scheduled.getDate() - 1);
  }
  return scheduled.getTime();
}

function getNextScheduledTimestamp(nowTs = Date.now(), runTime = DEFAULT_BACKUP_RUN_TIME) {
  const { hours, minutes } = getRunTimeParts(runTime);
  const now = new Date(nowTs);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);
  if (scheduled.getTime() <= nowTs) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  return scheduled.getTime();
}

async function fetchBackupListFromScript(scriptUrl) {
  const res = await fetch(`${scriptUrl}?list=1`);
  const text = await res.text();
  if (!res.ok) throw createAppError("backup_list_failed");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw createAppError("backup_response_invalid");
  }
  if (!data?.ok) throw createAppError("backup_list_failed");
  return data.files || [];
}

async function deleteBackupById(scriptUrl, id) {
  if (!id) return;
  const res = await fetch(`${scriptUrl}?deleteId=${encodeURIComponent(id)}`);
  const text = await res.text();
  if (!res.ok) throw createAppError("backup_delete_failed");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw createAppError("backup_response_invalid");
  }
  if (!data?.ok) throw createAppError("backup_delete_failed");
}

async function trimBackups(scriptUrl) {
  try {
    const files = await fetchBackupListFromScript(scriptUrl);
    if (files.length <= 14) return;
    const toDelete = files.slice(14);
    for (const file of toDelete) {
      await deleteBackupById(scriptUrl, file.id);
    }
  } catch (err) {
    console.error("Failed to trim backup history", err);
  }
}

async function performBackup(reason = "manual") {
  const scriptUrl = getBackupScriptUrl();
  if (!scriptUrl) throw createAppError("backup_script_missing", 400);
  try {
    db?.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.error("Failed to checkpoint database before backup", err);
  }
  const dbBuffer = await fs.readFile(DB_PATH);
  const settings = await loadSettingsFile();
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    settings,
    database: {
      encoding: "base64",
      data: dbBuffer.toString("base64")
    }
  };
  const res = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) throw createAppError("backup_create_failed");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw createAppError("backup_response_invalid");
  }
  if (!data?.ok) throw createAppError("backup_create_failed");
  await trimBackups(scriptUrl);
  await persistBackupConfig({ ...backupConfig, lastRunAt: new Date().toISOString() }, { reschedule: false });
  return data;
}

async function restoreBackupFromScript(name) {
  const scriptUrl = getBackupScriptUrl();
  if (!scriptUrl) throw createAppError("backup_script_missing", 400);
  if (!name) throw createAppError("backup_name_required", 400);
  const res = await fetch(`${scriptUrl}?name=${encodeURIComponent(name)}`);
  const text = await res.text();
  if (!res.ok) throw createAppError("backup_restore_failed");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw createAppError("backup_response_invalid");
  }
  if (!data || typeof data !== "object") throw createAppError("backup_response_invalid");
  const databaseSection = data.database;
  if (!databaseSection || typeof databaseSection.data !== "string") throw createAppError("backup_database_missing");
  const buffer = Buffer.from(databaseSection.data, databaseSection.encoding || "base64");
  try {
    db?.close();
  } catch (err) {
    console.error("Failed to close database before restore", err);
  }
  await removeFileIfExists(DB_WAL_PATH);
  await removeFileIfExists(DB_SHM_PATH);
  const tmpPath = DB_PATH + ".tmp";
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, DB_PATH);
  db = initDatabase();
  resetLookupCaches();
  if (data.settings && typeof data.settings === "object") {
    await writeSettingsFile(data.settings);
  }
  whoCache = { ts: 0, options: [] };
}

async function maybeRunAutoBackup(force = false) {
  if (!backupConfig?.autoEnabled) return;
  const scriptUrl = getBackupScriptUrl();
  if (!scriptUrl) return;
  if (!force) {
    const lastTs = backupConfig?.lastRunAt ? Date.parse(backupConfig.lastRunAt) : 0;
    const lastScheduled = getLastScheduledTimestamp(Date.now(), backupConfig?.runTime);
    if (lastTs >= lastScheduled) return;
  }
  try {
    await performBackup("auto");
  } catch (err) {
    console.error("Auto-backup failed", err);
  }
}

function clearAutoBackupTimer() {
  if (autoBackupTimer) {
    clearTimeout(autoBackupTimer);
    autoBackupTimer = null;
  }
}

function scheduleAutoBackupTimer() {
  clearAutoBackupTimer();
  if (!backupConfig?.autoEnabled) return;
  const now = Date.now();
  const nextRun = getNextScheduledTimestamp(now, backupConfig?.runTime);
  const delay = Math.max(1000, nextRun - now);
  autoBackupTimer = setTimeout(async () => {
    autoBackupTimer = null;
    try {
      await maybeRunAutoBackup();
    } catch (err) {
      console.error("Scheduled backup failed", err);
    } finally {
      scheduleAutoBackupTimer();
    }
  }, delay);
  if (typeof autoBackupTimer?.unref === "function") autoBackupTimer.unref();
  maybeRunAutoBackup().catch((err) => console.error("Initial auto-backup check failed", err));
}

backupConfig = await loadBackupConfig();
if (!DEFAULT_BACKUP_SCRIPT_URL) {
  console.warn("BACKUP_SCRIPT_URL is not set. Configure the Google Script webhook URL in the add-on options.");
}
scheduleAutoBackupTimer();

app.get("/config.json", (_req, res) => {
  try {
    const { currencies, currencyRates } = getCurrenciesPayload();
    res.json({ props: PROP, categories: listCategories(), currencies, currencyRates });
  } catch (err) {
    handleRouteError(_req, res, err, "config_load_failed", "Failed to load config");
  }
});

app.get("/options/categories", (_req, res) => {
  try {
    res.json({ categories: listCategories() });
  } catch (err) {
    handleRouteError(_req, res, err, "categories_load_failed", "Failed to list categories");
  }
});
app.post("/options/categories", (req, res) => {
  try {
    const categories = addCategory(req.body?.name);
    res.json({ ok: true, categories });
  } catch (err) {
    handleRouteError(req, res, err, "category_add_failed", "Failed to add category");
  }
});
app.delete("/options/categories", (req, res) => {
  try {
    const name = req.body?.name;
    if (!removeCategory(name)) {
      return respondWithError(req, res, 404, "category_not_found");
    }
    res.json({ ok: true, categories: listCategories() });
  } catch (err) {
    handleRouteError(req, res, err, "category_delete_failed", "Failed to remove category");
  }
});

app.get("/options/currencies", (_req, res) => {
  try {
    res.json(getCurrenciesPayload());
  } catch (err) {
    handleRouteError(_req, res, err, "currencies_load_failed", "Failed to list currencies");
  }
});
app.post("/options/currencies", (req, res) => {
  try {
    const code = req.body?.code || req.body?.name;
    const rate = req.body?.rate;
    const payload = addCurrency(code, rate);
    res.json({ ok: true, ...payload });
  } catch (err) {
    handleRouteError(req, res, err, "currency_add_failed", "Failed to add currency");
  }
});
app.delete("/options/currencies", (req, res) => {
  try {
    const code = req.body?.code || req.body?.name;
    if (!removeCurrency(code)) {
      return respondWithError(req, res, 404, "currency_not_found");
    }
    res.json({ ok: true, ...getCurrenciesPayload() });
  } catch (err) {
    handleRouteError(req, res, err, "currency_delete_failed", "Failed to remove currency");
  }
});

app.post("/options/currency-rates", (req, res) => {
  try {
    const payload = setCurrencyRates(req.body?.rates);
    res.json({ ok: true, ...payload });
  } catch (err) {
    handleRouteError(req, res, err, "currency_rates_update_failed", "Failed to update currency rates");
  }
});

app.get("/backup/config", async (_req, res) => {
  try {
    if (!backupConfig) backupConfig = await loadBackupConfig();
    res.json({
      scriptUrl: backupConfig.scriptUrl || "",
      autoEnabled: Boolean(backupConfig.autoEnabled),
      lastRunAt: backupConfig.lastRunAt || null,
      defaultScriptUrl: DEFAULT_BACKUP_SCRIPT_URL
    });
  } catch (err) {
    handleRouteError(_req, res, err, "backup_settings_load_failed", "Failed to load backup config");
  }
});

app.post("/backup/config", async (req, res) => {
  try {
    const autoEnabled = Boolean(req.body?.autoEnabled);
    if (autoEnabled && !DEFAULT_BACKUP_SCRIPT_URL) {
      return respondWithError(req, res, 400, "backup_script_missing");
    }
    await persistBackupConfig({ autoEnabled });
    res.json({
      ok: true,
      config: {
        scriptUrl: backupConfig.scriptUrl,
        autoEnabled: backupConfig.autoEnabled,
        lastRunAt: backupConfig.lastRunAt,
        defaultScriptUrl: DEFAULT_BACKUP_SCRIPT_URL
      }
    });
  } catch (err) {
    handleRouteError(req, res, err, "backup_settings_save_failed", "Failed to save backup config");
  }
});

app.get("/backup/list", async (_req, res) => {
  try {
    const scriptUrl = getBackupScriptUrl();
    if (!scriptUrl) return res.json({ files: [] });
    const files = await fetchBackupListFromScript(scriptUrl);
    res.json({ files });
  } catch (err) {
    handleRouteError(_req, res, err, "backup_list_failed", "Failed to load backup list");
  }
});

app.post("/backup/run", async (_req, res) => {
  try {
    const result = await performBackup("manual");
    res.json({ ok: true, file: result });
  } catch (err) {
    handleRouteError(_req, res, err, "backup_create_failed", "Failed to create backup");
  }
});

app.post("/backup/restore", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return respondWithError(req, res, 400, "backup_name_required");
    await restoreBackupFromScript(name);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(req, res, err, "backup_restore_failed", "Failed to restore backup");
  }
});

function toISODate(date) {
  return formatLocalDateString(date);
}
function monthRange(refDate) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  return { start: formatLocalDateString(start), end: formatLocalDateString(end) };
}
function parseMonthStart(value) {
  if (typeof value !== "string" || !(/^\d{4}-\d{2}$/).test(value)) return null;
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}
function parseMonthEnd(value) {
  const start = parseMonthStart(value);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth() + 1, 0);
}
function resolveRange(query, options = {}) {
  const { includeAll = false, defaultToCurrentMonth = true } = options;
  const period = query?.period;
  const fromMonth = query?.fromMonth;
  const toMonth = query?.toMonth;
  const now = new Date();
  if (period === "last_month") {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return monthRange(prev);
  }
  if (period === "last_30_days") {
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: toISODate(startDate), end: toISODate(now) };
  }
  if (period === "this_month" || (!period && defaultToCurrentMonth)) {
    return monthRange(now);
  }
  if (includeAll && period === "all") {
    return { start: null, end: null };
  }
  const hasCustom = period === "custom" || fromMonth || toMonth;
  if (hasCustom) {
    let startDate = fromMonth ? parseMonthStart(fromMonth) : null;
    let endDate = toMonth ? parseMonthEnd(toMonth) : null;
    if (startDate && endDate && startDate > endDate) {
      const swap = startDate;
      startDate = endDate;
      endDate = swap;
    }
    return {
      start: startDate ? toISODate(startDate) : null,
      end: endDate ? toISODate(endDate) : null
    };
  }
  if (defaultToCurrentMonth) {
    return monthRange(now);
  }
  return { start: null, end: null };
}

function formatLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateFields(value) {
  if (!value) return { iso: null, local: null };
  try {
    const source = typeof value === "string" && value ? value : value?.start || value?.end || value;
    const d = new Date(source);
    if (Number.isNaN(d.getTime())) return { iso: null, local: null };
    let local = null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      local = value.slice(0, 10);
    }
    if (!local) local = formatLocalDateString(d);
    return { iso: d.toISOString(), local };
  } catch {
    return { iso: null, local: null };
  }
}

function normalizeDateInput(value) {
  return normalizeDateFields(value).iso;
}

function computeUsd(amount, currency) {
  const amt = Number(amount) || 0;
  const rate = getCurrencyRate(currency);
  return Number((amt * rate).toFixed(2));
}

function rowToPage(row) {
  const props = {};
  props[PROP.description] = { title: row.description ? [{ text: { content: row.description }, plain_text: row.description }] : [] };
  props[PROP.categories] = { select: row.category ? { name: row.category } : null };
  props[PROP.amount] = { number: typeof row.amount === "number" ? row.amount : null };
  props[PROP.currency] = { select: row.currency ? { name: row.currency } : null };
  props[PROP.date] = { date: row.date ? { start: row.date } : null };
  props[PROP.who] = { rich_text: row.who ? [{ text: { content: row.who }, plain_text: row.who }] : [] };
  props[PROP.usdAmount] = { number: typeof row.usd_amount === "number" ? row.usd_amount : null };
  return { id: String(row.id), properties: props };
}

let whoCache = { ts: 0, options: [] };
app.get("/options/who", (req, res) => {
  try {
    const force = req.query.force === "1";
    const now = Date.now();
    if (!force && whoCache.ts && now - whoCache.ts < WHO_CACHE_TTL) {
      return res.json({ options: whoCache.options });
    }
    const stmt = db.prepare("SELECT DISTINCT who FROM records WHERE who IS NOT NULL AND who != ''");
    const options = stmt.all().map(r => r.who).sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
    whoCache = { ts: now, options };
    res.json({ options });
  } catch (err) {
    handleRouteError(req, res, err, "options_load_failed", "Failed to load who options");
  }
});

app.get("/stats/categories", (req, res) => {
  try {
    const range = resolveRange(req.query, { defaultToCurrentMonth: true });
    const where = ["type = 'expenses'"];
    const params = {};
    if (range.start) { where.push(`${DATE_COLUMN_SQL} >= @start`); params.start = range.start; }
    if (range.end) { where.push(`${DATE_COLUMN_SQL} <= @end`); params.end = range.end; }
    const sql = `SELECT category, SUM(usd_amount) AS usd, COUNT(*) AS count FROM records WHERE ${where.join(" AND ")} GROUP BY category`;
    const rows = db.prepare(sql).all(params);
    let totalUsd = 0;
    const items = rows.map(r => {
      const usd = Number((r.usd || 0).toFixed(2));
      totalUsd += usd;
      return { category: r.category || "(unknown)", usd, count: r.count || 0 };
    }).sort((a, b) => b.usd - a.usd);
    res.json({ period: range, totalUsd: Number(totalUsd.toFixed(2)), items });
  } catch (err) {
    handleRouteError(req, res, err, "stats_categories_failed", "Failed to load category stats");
  }
});

app.get("/stats/summary", (req, res) => {
  try {
    const range = resolveRange(req.query, { includeAll: true, defaultToCurrentMonth: true });
    const where = (t) => {
      const parts = ["type = @t"]; const p = { t };
      if (range.start) { parts.push(`${DATE_COLUMN_SQL} >= @start`); p.start = range.start; }
      if (range.end) { parts.push(`${DATE_COLUMN_SQL} <= @end`); p.end = range.end; }
      return { sql: parts.join(" AND "), params: p };
    };
    const wExp = where('expenses');
    const wInc = where('income');
    const rowExp = db.prepare(`SELECT SUM(usd_amount) AS total, COUNT(*) AS count FROM records WHERE ${wExp.sql}`).get(wExp.params) || { total: 0, count: 0 };
    const rowInc = db.prepare(`SELECT SUM(usd_amount) AS total, COUNT(*) AS count FROM records WHERE ${wInc.sql}`).get(wInc.params) || { total: 0, count: 0 };
    const expenses = { totalUsd: Number((rowExp.total || 0).toFixed(2)), count: rowExp.count || 0 };
    const income = { totalUsd: Number((rowInc.total || 0).toFixed(2)), count: rowInc.count || 0 };
    const netUsd = Number((income.totalUsd - expenses.totalUsd).toFixed(2));
    res.json({ period: range, expenses, income, netUsd });
  } catch (err) {
    handleRouteError(req, res, err, "stats_summary_failed", "Failed to load summary stats");
  }
});

function buildListQuery(type, q) {
  const clauses = ["type = @type"]; const params = { type };
  const { desc, category, currency, who, from, to, period } = q || {};
  if (desc) { clauses.push("description LIKE @desc"); params.desc = `%${String(desc)}%`; }
  if (category) { clauses.push("category = @category"); params.category = String(category); }
  if (currency) { clauses.push("currency = @currency"); params.currency = String(currency); }
  if (who) { clauses.push("who LIKE @who"); params.who = `%${String(who)}%`; }
  if (period === "today") {
    const today = new Date().toISOString().slice(0, 10);
    clauses.push(`${DATE_COLUMN_SQL} = @today`); params.today = today;
  } else if (period === "last_week") {
    const now = new Date(); const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    clauses.push("date >= @weekAgo"); params.weekAgo = weekAgo.toISOString();
  } else if (period === "last_month") {
    const now = new Date(); const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const range = monthRange(prev);
    clauses.push(`${DATE_COLUMN_SQL} >= @start AND ${DATE_COLUMN_SQL} <= @end`); params.start = range.start; params.end = range.end;
  } else if (period === "last_30_days") {
    const now = new Date();
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    clauses.push("date >= @thirtyAgo"); params.thirtyAgo = thirtyAgo.toISOString();
  }
  if (from) { clauses.push(`${DATE_COLUMN_SQL} >= @from`); params.from = String(from); }
  if (to) { clauses.push(`${DATE_COLUMN_SQL} <= @to`); params.to = String(to); }
  let sortCol = "date";
  if (q.sortKey === "amount") sortCol = "amount";
  else if (q.sortKey === "description") sortCol = "description";
  const dir = q.sortDir === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(parseInt(q.limit || "20", 10), 1), 100);
  const offset = Math.max(parseInt(q.cursor || "0", 10), 0);
  return { sql: `SELECT * FROM records WHERE ${clauses.join(" AND ")} ORDER BY ${sortCol} ${dir} LIMIT @limit OFFSET @offset`, params: { ...params, limit, offset }, limit, nextOffset: offset + limit };
}

app.get("/api/:type", (req, res) => {
  try {
    const type = req.params.type === "income" ? "income" : "expenses";
    const year  = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    let { sql, params, limit, nextOffset } = buildListQuery(type, req.query);
    if (!params || typeof params !== "object") params = {};

    // фильтр по полю date (ISO)
    if (year && month) {
      const ym = `${String(year)}-${String(month).padStart(2, "0")}`;
      // фильтрация по префиксу "YYYY-MM" (устойчива к ISO-времени)
      const clause = "AND substr(date, 1, 7) = @ym";
      // вставляем до ORDER BY / LIMIT
      const idxOrder = sql.toLowerCase().indexOf("order by");
      const idxLimit = sql.toLowerCase().indexOf("limit");
      const cut = idxOrder !== -1 ? idxOrder : (idxLimit !== -1 ? idxLimit : sql.length);
      sql = sql.slice(0, cut) + " " + clause + " " + sql.slice(cut);
      params.ym = ym;
    }

    const rows = db.prepare(sql).all(params);
    const results = rows.map(rowToPage);
    const has_more = rows.length === limit;

    res.json({
      results,
      has_more,
      next_cursor: has_more ? String(nextOffset) : null,
    });
  } catch (err) {
    handleRouteError(req, res, err, "records_list_failed", "List failed");
  }
});

app.post("/api/:type", (req, res) => {
  try {
    const type = req.params.type === "income" ? "income" : "expenses";
    const p = req.body || {};
    const desc = (p.description || "").toString();
    const category = p.categories ? String(p.categories) : null;
    const amount = Number(p.amount) || 0;
    const currency = p.currency ? String(p.currency) : null;
    const { iso: date, local: dateLocal } = normalizeDateFields(p.date);
    const who = p.who ? String(p.who) : null;
    const usd = computeUsd(amount, currency);
    const stmt = db.prepare("INSERT INTO records (type, description, category, amount, currency, date, date_local, who, usd_amount) VALUES (@type,@description,@category,@amount,@currency,@date,@date_local,@who,@usd)");
    const info = stmt.run({ type, description: desc, category, amount, currency, date, date_local: dateLocal, who, usd });
    const row = db.prepare("SELECT * FROM records WHERE id = ?").get(info.lastInsertRowid);
    res.json(rowToPage(row));
    try { if (typeof notifyClients === "function") notifyClients(); } catch {}

    // === Web Push (body-only payload) ===
    try {
      const descRaw = (p[PROP.description] ?? p.description ?? "").toString();
      const categoryRaw = (p[PROP.categories] ?? p.category ?? p.categories ?? "");
      const categoryName = categoryRaw == null ? "" : String(categoryRaw);
      const currencyRaw = (p[PROP.currency] ?? p.currency ?? "");
      const currencyCode = currencyRaw == null ? "" : String(currencyRaw);
      const whoStr = (p[PROP.who] ?? p.who ?? "");
      const amt = Number(p[PROP.amount]);
      const amountStr = Number.isFinite(amt) ? amt.toFixed(2) : "";
      const parts = [];
      if (descRaw) parts.push(descRaw);
      if (categoryName) parts.push(categoryName);
      if (amountStr) parts.push(`${amountStr} ${currencyCode}`.trim());
      if (whoStr) parts.push(String(whoStr));
      const lang = getRequestLanguage(req);
      const titleKey = type === "income" ? "push_income_title" : "push_expense_title";
      const title = translateServerMessage(lang, titleKey);
      Promise.resolve()
        .then(() =>
          sendPushAll({
            title,
            body: parts.join(" - "),
            data: {
              type,
              [PROP.description]: descRaw,
              [PROP.categories]: categoryName,
              [PROP.amount]: Number.isFinite(amt) ? amt : null,
              [PROP.currency]: currencyCode,
              [PROP.who]: String(whoStr || "")
            }
          })
        )
        .catch(() => {});
    } catch (pushErr) {
      console.warn("push build failed", pushErr);
    }


    notifyClients();
  } catch (err) {
    handleRouteError(req, res, err, "record_create_failed", "Create failed");
  }
});

app.patch("/api/:type/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return respondWithError(req, res, 400, "invalid_id");
    const p = req.body || {};
    const prev = db.prepare("SELECT * FROM records WHERE id = ?").get(id);
    if (!prev) return respondWithError(req, res, 404, "not_found");
    const description = p.description !== undefined ? String(p.description || "") : prev.description;
    const category = p.categories !== undefined ? (p.categories ? String(p.categories) : null) : prev.category;
    const amount = p.amount !== undefined ? Number(p.amount) || 0 : prev.amount;
    const currency = p.currency !== undefined ? (p.currency ? String(p.currency) : null) : prev.currency;
    const nextDate = p.date !== undefined ? normalizeDateFields(p.date) : null;
    const date = p.date !== undefined ? nextDate?.iso : prev.date;
    const dateLocal = p.date !== undefined ? nextDate?.local : prev.date_local;
    const who = p.who !== undefined ? (p.who ? String(p.who) : null) : prev.who;
    const usd = computeUsd(amount, currency);
    db.prepare("UPDATE records SET description=@description, category=@category, amount=@amount, currency=@currency, date=@date, date_local=@dateLocal, who=@who, usd_amount=@usd WHERE id=@id").run({ id, description, category, amount, currency, date, dateLocal, who, usd });
    const row = db.prepare("SELECT * FROM records WHERE id = ?").get(id);
    res.json(rowToPage(row));
    notifyClients();
  } catch (err) {
    handleRouteError(req, res, err, "record_update_failed", "Update failed");
  }
});

app.delete("/api/:type/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return respondWithError(req, res, 400, "invalid_id");
    const info = db.prepare("DELETE FROM records WHERE id = ?").run(id);
    if (info.changes === 0) return respondWithError(req, res, 404, "not_found");
    res.json({ ok: true });
    notifyClients();
  } catch (err) {
    handleRouteError(req, res, err, "record_delete_failed", "Delete failed");
  }
});



// === AI helpers: currency normalization, Gemini call with constraints, normalization ===
function canonicalizeCurrency(s) {
  if (!s) return "BGN";
  let t = String(s).toLowerCase().trim();
  t = t.normalize("NFKD").replace(/[\u0301\u0308]/g, "");
  t = t.replaceAll("ё","е").replace(/\./g,"");
  const map = new Map([
    ["$", "USD"], ["usd","USD"], ["доллар","USD"], ["доллара","USD"], ["dollar","USD"], ["бакс","USD"], ["баксов","USD"],
    ["€", "EUR"], ["eur","EUR"], ["евро","EUR"],
    ["bgn","BGN"], ["лв","BGN"], ["лев","BGN"], ["лева","BGN"], ["левов","BGN"], ["леев","BGN"], ["лево","BGN"],
    ["uah","UAH"], ["грн","UAH"], ["гривна","UAH"], ["гривны","UAH"],
    ["rub","RUB"], ["руб","RUB"], ["рубль","RUB"], ["рубля","RUB"], ["р","RUB"],
    ["pln","PLN"], ["злотый","PLN"], ["злотых","PLN"],
    ["try","TRY"], ["лира","TRY"], ["лиры","TRY"],
    ["ron","RON"], ["лей","RON"], ["лея","RON"],
    ["gbp","GBP"], ["фунт","GBP"], ["фунта","GBP"]
  ]);
  if (map.has(t)) return map.get(t);
  t = t.replace(/[^a-z]/g,"");
  if (map.has(t)) return map.get(t);
  const iso = t.toUpperCase();
  if (/^[A-Z]{3}$/.test(iso)) return iso;
  return "BGN";
}

// Use existing listCategories() and getCurrenciesPayload()

async function callGeminiJson(phrase, categories, isoCurrencies) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const key   = process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("GEMINI_API_KEY is empty");

  const spec =
`Ты парсер финансовых фраз на русском.
Верни ТОЛЬКО валидный JSON по схеме:
{
  "type": "income|expenses",
  "description": "string",
  "category": "string",
  "amount": number,
  "currency": "ISO 4217",
  "who": "string",
  "date": "YYYY-MM-DD"
}

ОГРАНИЧЕНИЯ:
- category ∈ {${categories.map(c=>JSON.stringify(c)).join(", ")}}
- currency ∈ {${isoCurrencies.map(c=>JSON.stringify(c)).join(", ")}}

Исправляй опечатки валют: "лево","леев","лёва" => "BGN", "$" => "USD", "€" => "EUR".
Если нет суммы — amount=0. Если нет валюты — "BGN". Если нет типа — "expenses".`;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
              + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { responseMimeType: "application/json" },
      contents: [{ role: "user", parts: [{ text: spec + "\n\nФраза:\n" + String(phrase||"") }]}]
    })
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error("Gemini HTTP " + r.status + ": " + t);
  }
  const j = await r.json();
  const cand = (j && j.candidates && j.candidates[0]) || {};
  const part = (cand.content && cand.content.parts && cand.content.parts[0]) || {};
  const text = part.text || "{}";
  return JSON.parse(text);
}

async function callOpenAIJson(phrase, categories, isoCurrencies) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const key   = process.env.OPENAI_API_KEY || "";
  if (!key) throw new Error("OPENAI_API_KEY is empty");

  const spec = `Ты парсер финансовых фраз на русском.
Верни ТОЛЬКО валидный JSON по схеме:
{
  "type": "income|expenses",
  "description": "string",
  "category": "string",
  "amount": number,
  "currency": "ISO 4217",
  "who": "string",
  "date": "YYYY-MM-DD"
}

ОГРАНИЧЕНИЯ:
- category ∈ {${categories.map(c=>JSON.stringify(c)).join(", ")}}
- currency ∈ {${isoCurrencies.map(c=>JSON.stringify(c)).join(", ")}}

Исправляй опечатки валют: "лево","леев","лёва" => "BGN", "$" => "USD", "€" => "EUR".
Если нет суммы — amount=0. Если нет валюты — "BGN". Если нет типа — "expenses".

Фраза: ${phrase}`;

  const url = "https://api.openai.com/v1/chat/completions";
  
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: spec }],
      response_format: { type: "json_object" },
      temperature: 0.3
    })
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error("OpenAI HTTP " + r.status + ": " + t);
  }
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

async function callLLMJson_constrained(phrase, categories, isoCurrencies) {
  const provider = (process.env.AI_PROVIDER || "disabled").toLowerCase();
  
  if (provider === "disabled") {
    throw new Error("AI parsing is disabled. Set ai_provider to 'gemini' or 'openai' in addon configuration.");
  }
  
  if (provider === "openai") {
    return await callOpenAIJson(phrase, categories, isoCurrencies);
  }
  
  // Default to Gemini
  return await callGeminiJson(phrase, categories, isoCurrencies);
}

function normalizeLLM(parsed, categories, isoCurrencies) {
  const out = Object.create(null);
  out.type = (parsed && parsed.type === "income") ? "income" : "expenses";
  out.description = String((parsed && parsed.description) ?? "").trim();
let cat = String((parsed && parsed.category) ?? "Other").trim();
if (!categories.includes(cat)) cat = categories.includes("Other") ? "Other" : (categories[0] || "Other");
  out.category = cat;
  out.amount = Number((parsed && parsed.amount) ?? 0) || 0;
  let cur = String((parsed && parsed.currency) ?? "BGN").trim();
  cur = canonicalizeCurrency(cur);
  const allowed = new Set(isoCurrencies);
  if (!allowed.has(cur)) cur = "BGN";
  out.currency = cur;
  out.who = String((parsed && parsed.who) ?? "").trim();
  out.date = new Date().toISOString().slice(0,10);
  return out;
}

// === AI route: фраза + who -> запись, дата с сервера ===
app.post("/api/ai/phrase", async (req, res) => {
  try {
    const text = String((req.body && (req.body.text || req.body.phrase)) || "").trim();
    const whoFromApi = String((req.body && req.body.who) || "").trim();
  if (!text) return respondWithError(req, res, 400, "text_required");

    const categories = listCategories();
    const { currencies } = getCurrenciesPayload();

    const raw = await callLLMJson_constrained(text, categories, currencies);
    const p   = normalizeLLM(raw, categories, currencies);
    if (whoFromApi) p.who = whoFromApi;
    p.date = new Date().toISOString().slice(0,10);

    if (!p.amount || p.amount <= 0) {
      return res.status(422).json({
        ok: false,
        code: "amount_required",
        error: translateServerMessage(req, "amount_required", "Amount must be greater than zero"),
        parsed: p
      });
    }

    const now = new Date();
    const iso = now.toISOString();
    const local = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
    const usd = computeUsd(p.amount, p.currency);

    const info = db.prepare(
      "INSERT INTO records(type,description,category,amount,currency,date,date_local,who,usd_amount) " +
      "VALUES(@type,@desc,@cat,@amt,@cur,@iso,@local,@who,@usd)"
    ).run({ type:p.type, desc:p.description, cat:p.category, amt:p.amount, cur:p.currency, iso, local, who:p.who || "", usd });

    const row  = db.prepare("SELECT * FROM records WHERE id=?").get(info.lastInsertRowid);
    const page = rowToPage(row);
    res.json({ ok:true, record: page, parsed: p, raw });

    try { if (typeof notifyClients==="function") notifyClients(); } catch {}
    try {
      const parts = [];
      if (p.description) parts.push(p.description);
      if (p.category) parts.push(p.category);
      if (p.amount) parts.push(`${p.amount.toFixed(2)} ${p.currency}`);
      if (p.who) parts.push(p.who);
      const lang = getRequestLanguage(req);
      const titleKey = p.type === "income" ? "push_income_title" : "push_expense_title";
      sendPushAll({
        title: translateServerMessage(lang, titleKey),
        body: parts.join(" - "),
        data: { type: p.type, ...p }
      });
    } catch {}
  } catch (e) {
    console.error("ai/phrase", e);
    const status = e?.status || 500;
    const code = e?.code || "server_error";
    res.status(status).json({ ok: false, code, error: translateServerMessage(req, code, String(e.message || e)) });
  }
});

const wss = new WebSocketServer({ noServer: true });
const sockets = new Set();

wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.on("close", () => sockets.delete(ws));
});



const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`Finance dashboard: http://localhost:${PORT}`)
);
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

// функция для уведомлений клиентов
function notifyClients() {
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send("update");
  }
}


/* ===== Web Push routes ===== */
app.get("/push/publicKey", (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || "" });
});

app.post("/push/subscribe", express.json(), async (req,res) => {
  try {
    const sub = req.body || {};
    const list = await readSubs();
    if (!list.find(s => s.endpoint === sub.endpoint)) {
      list.push(sub);
      await writeSubs(list);
    }
    res.json({ ok:true });
  } catch (e) {
    console.error("subscribe failed", e);
    res.status(500).json({
      ok: false,
      code: "server_error",
      error: translateServerMessage(req, "server_error", "Unexpected server error")
    });
  }
});

app.post("/push/unsubscribe", express.json(), async (req,res) => {
  try {
    const { endpoint } = req.body || {};
    const list = await readSubs();
    const next = list.filter(s => s.endpoint !== endpoint);
    await writeSubs(next);
    res.json({ ok:true });
  } catch (e) {
    console.error("unsubscribe failed", e);
    res.status(500).json({
      ok: false,
      code: "server_error",
      error: translateServerMessage(req, "server_error", "Unexpected server error")
    });
  }
});

// Debug status and test push
app.get("/debug/status", async (_req,res) => {
  const subs = await readSubs();
  res.json({
    webpushLoaded: Boolean(webpush),
    vapidPubLen: (process.env.VAPID_PUBLIC_KEY||"").length,
    vapidPrivLen: (process.env.VAPID_PRIVATE_KEY||"").length,
    subsCount: subs.length,
    subs: subs.map(s => ({ endpoint: (s.endpoint || "").slice(0, 64) + "..." }))
  });
});

app.post("/debug/push", express.json(), async (req,res)=>{
  const lang = getRequestLanguage(req);
  await sendPushAll({
    title: translateServerMessage(lang, "debug_push_title"),
    body: translateServerMessage(lang, "debug_push_body"),
    data:{test:true}
  });
  res.json({ ok:true });
});
