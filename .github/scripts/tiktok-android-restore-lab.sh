#!/usr/bin/env bash
set -Eeuo pipefail

readonly package_name='com.zhiliaoapp.musically'
readonly diagnostics_dir="$PWD/android-restore-diagnostics"
mkdir -p "$diagnostics_dir"

adb wait-for-device
test "$(adb shell getprop sys.boot_completed | tr -d '\r')" = '1'
adb shell pm path "$package_name"
adb shell am force-stop "$package_name"
adb shell monkey -p "$package_name" -c android.intent.category.LAUNCHER 1
sleep 20
DIAGNOSTICS_DIR="$diagnostics_dir" bash .github/scripts/verify-tiktok-login.sh
node automation/android-pairing-lab.mjs validated
