#!/usr/bin/env bash
set -Eeuo pipefail

readonly package_name='com.zhiliaoapp.musically'
readonly diagnostics_dir="$PWD/android-pairing-diagnostics"
mkdir -p "$diagnostics_dir"

capture_on_exit() {
  DIAGNOSTICS_DIR="$diagnostics_dir" bash .github/scripts/verify-tiktok-login.sh >/dev/null 2>&1 || true
}
trap capture_on_exit EXIT

mapfile -t apk_files < "$TIKTOK_APK_LIST"
test "${#apk_files[@]}" -gt 0
adb install-multiple -r "${apk_files[@]}"
adb shell pm path "$package_name"
adb shell am force-stop "$package_name"
adb shell monkey -p "$package_name" -c android.intent.category.LAUNCHER 1
sleep 15

export DISPLAY=:99
scrcpy --no-audio --no-clipboard-autosync --stay-awake --max-fps=20 --video-bit-rate=4M \
  --window-title='TikTok Android — PostFlow P3' --window-width=450 --window-height=900 \
  > /tmp/scrcpy.log 2>&1 &
scrcpy_pid=$!

for _ in $(seq 1 30); do
  if xdpyinfo -display :99 >/dev/null 2>&1 && kill -0 "$scrcpy_pid" 2>/dev/null; then break; fi
  sleep 1
done
kill -0 "$scrcpy_pid"
timeout 5 bash -c '</dev/tcp/127.0.0.1/5900'
timeout 5 bash -c '</dev/tcp/127.0.0.1/6080'
node automation/android-pairing-lab.mjs ready

authenticated=false
for _ in $(seq 1 192); do
  if DIAGNOSTICS_DIR="$diagnostics_dir" VERIFY_PROBE=true bash .github/scripts/verify-tiktok-login.sh; then
    authenticated=true
    break
  fi
  sleep 10
done
test "$authenticated" = true
node automation/android-pairing-lab.mjs detected
DIAGNOSTICS_DIR="$diagnostics_dir" bash .github/scripts/verify-tiktok-login.sh

adb shell am force-stop "$package_name"
adb shell sync
adb emu kill || true
for _ in $(seq 1 30); do
  adb get-state >/dev/null 2>&1 || break
  sleep 1
done

avd_root="$HOME/.android/avd"
test -d "$avd_root/test.avd"
rm -rf "$avd_root/test.avd"/*.lock "$avd_root/test.avd/snapshots"
rm -f "$avd_root/test.avd/cache.img" "$avd_root/test.avd/cache.img.qcow2"

pass_file=$(mktemp)
chmod 600 "$pass_file"
printf '%s' "$SESSION_ENCRYPTION_KEY" > "$pass_file"
encrypted="$RUNNER_TEMP/postflow-android-session.tar.zst.gpg"
tar --sparse -C "$avd_root" -cf - test.avd test.ini \
  | zstd -T0 -6 \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$pass_file" \
      --symmetric --cipher-algo AES256 --output "$encrypted"
rm -f "$pass_file"

archive_bytes=$(stat -c '%s' "$encrypted")
archive_sha=$(sha256sum "$encrypted" | awk '{print $1}')
parts_dir="$RUNNER_TEMP/android-session-parts"
mkdir -p "$parts_dir"
split -d -a 3 -b 100M "$encrypted" "$parts_dir/session.part."
mapfile -t parts < <(find "$parts_dir" -maxdepth 1 -type f -name 'session.part.*' | sort)
test "${#parts[@]}" -gt 0

storage_prefix="android-lab/$ACCOUNT_ID/$PAIRING_ID"
manifest_path="$storage_prefix/manifest.txt"
manifest="$RUNNER_TEMP/android-session-manifest.txt"
printf 'format=postflow-avd-v1\nsha256=%s\nbytes=%s\nchunks=%s\n' \
  "$archive_sha" "$archive_bytes" "${#parts[@]}" > "$manifest"

upload_object() {
  local source=$1
  local destination=$2
  curl --fail-with-body --silent --show-error --request POST \
    "$SUPABASE_URL/storage/v1/object/browser-profiles/$destination" \
    --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --header 'Content-Type: application/octet-stream' \
    --data-binary "@$source" >/dev/null
}

for part in "${parts[@]}"; do
  upload_object "$part" "$storage_prefix/$(basename "$part")"
done
upload_object "$manifest" "$manifest_path"
rm -f "$encrypted"
rm -rf "$parts_dir"

echo "SESSION_MANIFEST_PATH=$manifest_path" >> "$GITHUB_ENV"
node automation/android-pairing-lab.mjs saved
trap - EXIT
echo "Encrypted AVD bytes: $archive_bytes across ${#parts[@]} private chunks."
