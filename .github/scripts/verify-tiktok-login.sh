#!/usr/bin/env bash
set -Eeuo pipefail

readonly package_name='com.zhiliaoapp.musically'
readonly diagnostics_dir="${DIAGNOSTICS_DIR:-$PWD/android-pairing-diagnostics}"
mkdir -p "$diagnostics_dir"

capture() {
  adb exec-out screencap -p > "$diagnostics_dir/screen.png" 2>/dev/null || true
  timeout 30 adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/window.xml "$diagnostics_dir/window.xml" >/dev/null 2>&1 || true
  adb shell dumpsys activity activities > "$diagnostics_dir/activities.txt" 2>&1 || true
  adb logcat -d -v threadtime > "$diagnostics_dir/logcat.txt" 2>&1 || true
}

tap_matching_node() {
  local pattern=$1
  capture
  UI_PATTERN="$pattern" UI_XML="$diagnostics_dir/window.xml" python3 - <<'PY'
import os
import re
import subprocess
import xml.etree.ElementTree as ET

pattern = re.compile(os.environ['UI_PATTERN'], re.I)
root = ET.parse(os.environ['UI_XML']).getroot()
for node in root.iter('node'):
    haystack = ' '.join((node.attrib.get('text', ''), node.attrib.get('content-desc', ''), node.attrib.get('resource-id', '')))
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.attrib.get('bounds', ''))
    if pattern.search(haystack) and match:
        x1, y1, x2, y2 = map(int, match.groups())
        subprocess.run(['adb', 'shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2)], check=True)
        raise SystemExit(0)
raise SystemExit(1)
PY
}

adb wait-for-device
test -n "$(adb shell pidof "$package_name" | tr -d '\r')"

# Android's first immersive-mode notice is a system overlay. Dismiss it by resource id.
tap_matching_node 'android:id/ok|^Got it$' || true
sleep 2

# Open the account screen through its accessibility label, never a fixed coordinate.
tap_matching_node '^(Profile|Hồ sơ)$'
sleep 6
capture

if rg -qi 'I18nSignUpActivity|LoginActivity|AuthorizeActivity' "$diagnostics_dir/activities.txt"; then
  echo 'TikTok is still on an authentication activity.' >&2
  exit 1
fi

rg -qi '(Edit profile|Sửa hồ sơ|Share profile|Chia sẻ hồ sơ|Set up profile|Thiết lập hồ sơ)' "$diagnostics_dir/window.xml"
rg -q "(mResumedActivity|topResumedActivity).*${package_name}.*MainActivity" "$diagnostics_dir/activities.txt"
echo 'TikTok account UI is authenticated.'
