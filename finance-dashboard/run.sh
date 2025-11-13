#!/bin/sh
set -e

OPTS=/data/options.json
get_json() {
  if [ -f "$OPTS" ]; then
    jq -r "$1 // empty" "$OPTS"
  fi
}

ensure_parent_dir() {
  target_path="$1"
  if [ -n "$target_path" ]; then
    dir_path="$(dirname "$target_path")"
    mkdir -p "$dir_path"
  fi
}

export DESC_PROP="$(get_json .desc_prop)"
export CATS_PROP="$(get_json .cats_prop)"
export AMOUNT_PROP="$(get_json .amount_prop)"
export CURRENCY_PROP="$(get_json .currency_prop)"
export DATE_PROP="$(get_json .date_prop)"
export WHO_PROP="$(get_json .who_prop)"
export USD_AMOUNT_PROP="$(get_json .usd_amount_prop)"
export AUTH_USERS="$(get_json .auth_users)"
export ADMIN_USER="$(get_json .admin_user)"
export ADMIN_PASS="$(get_json .admin_pass)"
export SESSION_SECRET="$(get_json .session_secret)"
export PORT="3000"

SESSION_STORE_PATH="$(get_json .session_store_path)"
if [ -z "$SESSION_STORE_PATH" ] || [ "$SESSION_STORE_PATH" = "null" ]; then
  SESSION_STORE_PATH="/data/sessions"
fi
mkdir -p "$SESSION_STORE_PATH"
export SESSION_STORE_PATH

BACKUP_SCRIPT_URL="$(get_json .backup_script_url)"
if [ -z "$BACKUP_SCRIPT_URL" ] || [ "$BACKUP_SCRIPT_URL" = "null" ]; then
  BACKUP_SCRIPT_URL=""
fi
export BACKUP_SCRIPT_URL

BACKUP_CONFIG_PATH="$(get_json .backup_config_path)"
if [ -z "$BACKUP_CONFIG_PATH" ] || [ "$BACKUP_CONFIG_PATH" = "null" ]; then
  BACKUP_CONFIG_PATH="/data/backup-config.json"
fi
export BACKUP_CONFIG_PATH

BACKUP_RUN_TIME="$(get_json .backup_run_time)"
if [ -z "$BACKUP_RUN_TIME" ] || [ "$BACKUP_RUN_TIME" = "null" ]; then
  BACKUP_RUN_TIME="03:00"
fi
export BACKUP_RUN_TIME

ACCESS_TOKEN="$(get_json .access_token)"
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  ACCESS_TOKEN=""
fi
export ACCESS_TOKEN

# VAPID Web Push keys from addon options (optional). If empty, push will be disabled.
VAPID_PUBLIC_KEY="$(get_json .vapid_public_key)"
if [ -z "$VAPID_PUBLIC_KEY" ] || [ "$VAPID_PUBLIC_KEY" = "null" ]; then
  VAPID_PUBLIC_KEY=""
fi
export VAPID_PUBLIC_KEY

VAPID_PRIVATE_KEY="$(get_json .vapid_private_key)"
if [ -z "$VAPID_PRIVATE_KEY" ] || [ "$VAPID_PRIVATE_KEY" = "null" ]; then
  VAPID_PRIVATE_KEY=""
fi
export VAPID_PRIVATE_KEY

# AI configuration (optional). Choose provider: disabled, gemini or openai
AI_PROVIDER="$(get_json .ai_provider)"
if [ -z "$AI_PROVIDER" ] || [ "$AI_PROVIDER" = "null" ]; then
  AI_PROVIDER="disabled"
fi
export AI_PROVIDER

# Gemini AI configuration (optional). If empty, AI parsing will be disabled.
GEMINI_API_KEY="$(get_json .gemini_api_key)"
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "null" ]; then
  GEMINI_API_KEY=""
fi
export GEMINI_API_KEY

GEMINI_MODEL="$(get_json .gemini_model)"
if [ -z "$GEMINI_MODEL" ] || [ "$GEMINI_MODEL" = "null" ]; then
  GEMINI_MODEL="gemini-2.0-flash"
fi
export GEMINI_MODEL

# OpenAI configuration (optional). Used when ai_provider=openai
OPENAI_API_KEY="$(get_json .openai_api_key)"
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "null" ]; then
  OPENAI_API_KEY=""
fi
export OPENAI_API_KEY

OPENAI_MODEL="$(get_json .openai_model)"
if [ -z "$OPENAI_MODEL" ] || [ "$OPENAI_MODEL" = "null" ]; then
  OPENAI_MODEL="gpt-4o-mini"
fi
export OPENAI_MODEL

SETTINGS_PATH="$(get_json .user_settings_path)"
if [ -z "$SETTINGS_PATH" ] || [ "$SETTINGS_PATH" = "null" ]; then
  SETTINGS_PATH="/data/user-settings.json"
fi
ensure_parent_dir "$SETTINGS_PATH"
export USER_SETTINGS_PATH="$SETTINGS_PATH"

# Local DB path (persistent in /data)
DB_PATH="$(get_json .db_path)"
if [ -z "$DB_PATH" ] || [ "$DB_PATH" = "null" ]; then
  DB_PATH="/data/finance.db"
fi
ensure_parent_dir "$DB_PATH"
export DB_PATH

ensure_parent_dir "$BACKUP_CONFIG_PATH"

cd /app
exec node server_local.js
