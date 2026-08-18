#!/usr/bin/env bash
set -Eeuo pipefail

readonly package_name='com.zhiliaoapp.musically'
readonly diagnostics_dir="$PWD/android-diagnostics"
mkdir -p "$diagnostics_dir"

capture_diagnostics() {
  adb exec-out screencap -p > "$diagnostics_dir/screen.png" 2>/dev/null || true
  timeout 30 adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/window.xml "$diagnostics_dir/window.xml" >/dev/null 2>&1 || true
  adb shell dumpsys activity activities > "$diagnostics_dir/activities.txt" 2>&1 || true
  adb shell dumpsys package "$package_name" > "$diagnostics_dir/package.txt" 2>&1 || true
  adb logcat -d -v threadtime > "$diagnostics_dir/logcat.txt" 2>&1 || true
}

trap capture_diagnostics EXIT

adb wait-for-device
test "$(adb shell getprop sys.boot_completed | tr -d '\r')" = '1'

echo 'Supported ABIs:'
adb shell getprop ro.product.cpu.abilist
echo 'Native bridge:'
adb shell getprop ro.dalvik.vm.native.bridge

mapfile -t apk_files < "$TIKTOK_APK_LIST"
test "\${#apk_files[@]}" -gt 0
adb install-multiple -r "\${apk_files[@]}"
adb shell pm path "$package_name"

adb shell am force-stop "$package_name"
adb shell monkey -p "$package_name" -c android.intent.category.LAUNCHER 1
sleep 20

adb shell dumpsys activity activities | tee "$diagnostics_dir/activities.txt"
grep -Eq "(mResumedActivity|topResumedActivity).*\${package_name}" "$diagnostics_dir/activities.txt"

capture_diagnostics
trap - EXIT
test -s "$diagnostics_dir/screen.png"
test -s "$diagnostics_dir/window.xml"
echo 'TikTok app is installed and owns the resumed Android activity.'
