# Finance Dashboard - Home Assistant Add-on Repository

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkirillkpts%2Fkkhaaddons)

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armv7 Architecture][armv7-shield]

Finance Dashboard is a local-first personal finance web app with AI voice input, Apple Pay automation, push notifications, and multi-currency analytics. This repository hosts the Home Assistant add-on source only; the Docker image is compiled on your Home Assistant host during installation.

## Features

- Track income and expenses with powerful filtering and charting.
- Multi-currency support with automatic USD conversion.
- Secure authentication plus API tokens for automations.
- Web push notifications and an installable PWA front-end.
- AI-powered voice/iOS Shortcuts input and Apple Pay automation.
- Optional Google Drive backups via the bundled Apps Script.
- English and Russian language.

## Repository structure

```text
.
|-- LICENSE
|-- README.md
|-- repository.yaml               # Add-on repository metadata for Home Assistant
\-- finance-dashboard/            # The add-on itself
    |-- config.yaml               # Add-on manifest and options
    |-- build.yaml                # Base images (ensures on-device builds)
    |-- Dockerfile                # Installs the Node.js app at install time
    |-- rootfs/                   # Files copied to the image root (s6 services)
    |-- run.sh                    # Reads options.json and bootstraps the app
    |-- CHANGELOG.md
    |-- DOCS.md                   # Detailed user documentation
    |-- README.md                 # Add-on summary (shown in Supervisor UI)
    |-- translations/en.yaml      # Configuration labels in Supervisor UI
    \-- app/                      # Node.js project (server plus static assets)
```

## Installation

1. Add `https://github.com/kirillkpts/kkhaaddons` under **Settings -> Add-ons -> Add-on Store -> ... -> Repositories** in Home Assistant (or click the badge above).
2. Install **Finance Dashboard** from the add-on store.
3. Configure credentials, AI provider, storage paths, and optional automations.
4. Start the add-on and open the web UI (default `http://homeassistant.local:3000`).

Detailed setup instructions, Apple Pay or voice walkthroughs, and troubleshooting guides live in [finance-dashboard/DOCS.md](./finance-dashboard/DOCS.md).

## Source-built add-on

- Ships source code only. Home Assistant uses `Dockerfile` plus `build.yaml` to compile the container on the target device for `amd64`, `aarch64`, and `armv7`.
- The runtime Node.js application lives in `finance-dashboard/app`. Dependencies are installed with `npm --omit=dev` inside the container to keep the footprint lean.
- Runtime state (database, sessions, settings, backups) is persisted under `/data` inside the add-on, matching Supervisor best practices.

## Documentation and support

- [User and automation docs](./finance-dashboard/DOCS.md)
- [Add-on changelog](./finance-dashboard/CHANGELOG.md)
- [Issue tracker](https://github.com/kirillkpts/kkhaaddons/issues)

## Contributing

PRs and bug reports are welcome. Please:
- Keep edits ASCII-friendly unless a file already uses Unicode.
- Run the app locally with `npm start` inside `finance-dashboard/app` when touching the UI or server code.
- Describe user-facing changes in the changelog when bumping the add-on version.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for full terms.

---

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
