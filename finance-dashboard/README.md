# Home Assistant Add-on - Finance Dashboard

_Personal finance dashboard with AI voice input, Apple Pay automation, multi-currency analytics, and local backups._

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armv7 Architecture][armv7-shield]

Finance Dashboard bundles a zero-external-dependency Node.js app that runs entirely inside Home Assistant. The add-on builds from source when you install it, so your instance always compiles the latest UI and API without waiting for published container images.

## Key features

- Clean web UI for expenses/income, charts, filters, and category management.
- AI-powered natural language parsing for voice and iOS Shortcuts.
- Apple Pay automation that creates transactions instantly.
- Web push notifications and an installable PWA experience.
- Optional Google Drive backups via the included Apps Script.
- English and Russian interface strings with live WebSocket updates.

## Installation (Home Assistant)

1. Add `https://github.com/kirillkpts/kkhaaddons` to **Settings -> Add-ons -> Add-on Store -> ... -> Repositories**.
2. Install **Finance Dashboard** from the store and wait for the local Docker build to finish.
3. Open the add-on, adjust configuration (credentials, AI providers, paths, tokens).
4. Start the service and click **Open Web UI** (default `http://homeassistant.local:3000`).

Full walkthroughs (voice automations, Apple Pay, backups, troubleshooting) live in [DOCS.md](DOCS.md).

## Configuration essentials

| Option | Description | Default |
| --- | --- | --- |
| `admin_user` / `admin_pass` | Primary credentials for the dashboard UI. Both values are required. | `""` |
| `auth_users` | Optional comma-separated list of `user:password` pairs. | `""` |
| `session_secret` | Random string for Express session encryption. | `"change_this_secret"` |
| `session_store_path` | Directory for persisted session files. | `"/data/sessions"` |
| `db_path` | Location of the SQLite database. | `"/data/finance.db"` |
| `user_settings_path` | JSON file with dashboard preferences. | `"/data/user-settings.json"` |
| `access_token` | Bearer token required by the REST API and automations. | `""` |
| `ai_provider` | `disabled`, `gemini`, or `openai`. Enables natural-language input. | `"disabled"` |
| `gemini_api_key` / `gemini_model` | Credentials for Google Gemini when AI is enabled. | `""` / `"gemini-2.0-flash"` |
| `openai_api_key` / `openai_model` | Credentials for OpenAI when AI is enabled. | `""` / `"gpt-4o-mini"` |
| `vapid_public_key` / `vapid_private_key` | Keys for enabling web push notifications. | `""` |
| `backup_script_url` | Google Apps Script endpoint for automatic backups. | `""` |
| `backup_config_path` | Where backup metadata is stored. | `"/data/backup-config.json"` |
| `backup_run_time` | HH:MM (24 h) time when backups run. | `"03:00"` |

## Build and storage notes

- The container installs dependencies inside the Supervisor build pipeline, so no external registry is required.
- `run.sh` provisions `/data` directories for sessions, backups, and the SQLite database before starting `server_local.js`.
- The UI assets live in `app/public`, while the Express server lives in `app/server_local.js`.

## Documentation and support

- [Full documentation](DOCS.md)
- [Changelog](CHANGELOG.md)
- [Issue tracker](https://github.com/kirillkpts/kkhaaddons/issues)

---

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
