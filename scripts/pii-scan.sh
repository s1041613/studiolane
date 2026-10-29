#!/usr/bin/env bash
# Portability: written for both macOS's bash 3.2 / BSD grep and Ubuntu's
# bash 5 / GNU grep. No associative arrays, no mapfile, no `grep -P`.
#
# Deliberate exceptions (beyond the plain allow-listed email domains):
#   - "admin@email.com" is the Supabase CLI's own default, commented-out
#     placeholder in supabase/config.toml (shipped by `supabase init`, not
#     something anyone pasted in). It is allow-listed by exact value, not by
#     domain, so it does not open up the @email.com domain in general.
#   - The bare word "service_role" is NOT pattern-matched on its own: it is
#     a normal Postgres/Supabase role name that legitimately appears in
#     config and SQL throughout any Supabase project. An actual service_role
#     *key* is a JWT and is caught by JWT_RE below.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

fail=0

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
GCAL_RE='[A-Za-z0-9._%+-]+@group\.calendar\.google\.com|calendar\.google\.com/calendar'
IG_RE='instagram\.com'
JWT_RE='eyJ[A-Za-z0-9_=-]+\.eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+'
SECRET_KEY_RE='sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|sb_secret_[A-Za-z0-9]+'
PRIVATE_KEY_RE='-----BEGIN [A-Z ]*PRIVATE KEY-----'
PG_URL_RE='postgres(ql)?://[^:/@[:space:]]+:[^@/[:space:]]+@'

PII_NAMES_FILE="$HOME/.config/studiolane/pii-names.txt"

is_skipped_file() {
  case "$1" in
    pnpm-lock.yaml|scripts/pii-scan.sh) return 0 ;;
    *) return 1 ;;
  esac
}

report() {
  local file="$1" lineno="$2" match="$3"
  printf '%s:%s:%s\n' "$file" "$lineno" "$match"
  fail=1
}

is_allowed_email() {
  local email="$1"
  case "$email" in
    *@test.local|*@example.com|*@example.org|*@example.net) return 0 ;;
    admin@email.com) return 0 ;;
    *) return 1 ;;
  esac
}

scan_simple() {
  local file="$1" pattern="$2" lineno match
  while IFS=: read -r lineno match; do
    [ -n "$lineno" ] || continue
    report "$file" "$lineno" "$match"
  done < <(grep -InoE -- "$pattern" "$file" 2>/dev/null)
}

scan_emails() {
  local file="$1" lineno match lower
  while IFS=: read -r lineno match; do
    [ -n "$lineno" ] || continue
    lower=$(printf '%s' "$match" | tr 'A-Z' 'a-z')
    is_allowed_email "$lower" && continue
    report "$file" "$lineno" "$match"
  done < <(grep -InoE -- "$EMAIL_RE" "$file" 2>/dev/null)
}

scan_pii_names() {
  local file="$1" name lineno match
  [ -f "$PII_NAMES_FILE" ] || return 0
  while IFS= read -r name || [ -n "$name" ]; do
    [ -n "$name" ] || continue
    while IFS=: read -r lineno match; do
      [ -n "$lineno" ] || continue
      report "$file" "$lineno" "$match"
    done < <(grep -InoFi -- "$name" "$file" 2>/dev/null)
  done < "$PII_NAMES_FILE"
}

while IFS= read -r file; do
  [ -n "$file" ] || continue
  is_skipped_file "$file" && continue
  [ -f "$file" ] || continue

  scan_emails "$file"
  scan_simple "$file" "$GCAL_RE"
  scan_simple "$file" "$IG_RE"
  scan_simple "$file" "$JWT_RE"
  scan_simple "$file" "$SECRET_KEY_RE"
  scan_simple "$file" "$PRIVATE_KEY_RE"
  scan_simple "$file" "$PG_URL_RE"
  scan_pii_names "$file"
done < <(git ls-files -co --exclude-standard)

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "pii-scan: clean"
exit 0
