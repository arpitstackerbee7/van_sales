#!/bin/bash
# Prepare the generated android/ project for a release build:
# give it a real signing key, and enough JVM headroom to compile.
#
# `expo prebuild` generates an android/ project whose release build is signed
# with the *debug* keystore -- its own comment says not to ship that. This
# creates a real release key and points the release build at it.
#
# The keystore lives outside the repo and its passwords go in the user-level
# ~/.gradle/gradle.properties, so neither is ever committed. Back the
# keystore up: Android will refuse to install an update signed with a
# different key, so losing it means every device has to uninstall first.
#
# Re-run after `expo prebuild --clean`, which regenerates build.gradle.
set -euo pipefail

KEYSTORE_DIR="${HOME}/.van-sales"
KEYSTORE="${KEYSTORE_DIR}/van-sales-release.keystore"
ALIAS="van-sales"
GRADLE_PROPS="${HOME}/.gradle/gradle.properties"
BUILD_GRADLE="$(cd "$(dirname "$0")/.." && pwd)/android/app/build.gradle"

mkdir -p "${KEYSTORE_DIR}" "$(dirname "${GRADLE_PROPS}")"

if [ ! -f "${KEYSTORE}" ]; then
  # Generated once and reused. A random password is fine because the file
  # itself is the secret and it never leaves this machine.
  #
  # Not `tr < /dev/urandom | head -c N`: head closes the pipe, tr dies of
  # SIGPIPE, and pipefail turns that into an abort right here.
  PASSWORD="$(openssl rand -hex 24)"

  keytool -genkeypair -v \
    -keystore "${KEYSTORE}" \
    -alias "${ALIAS}" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "${PASSWORD}" -keypass "${PASSWORD}" \
    -dname "CN=Van Sales, OU=Field Operations, O=Van Sales, L=Dubai, C=AE"

  chmod 600 "${KEYSTORE}"

  # Strip any previous block, then append the current one.
  if [ -f "${GRADLE_PROPS}" ]; then
    sed -i '' '/^VAN_SALES_/d' "${GRADLE_PROPS}" 2>/dev/null || true
  fi
  cat >> "${GRADLE_PROPS}" <<EOF
VAN_SALES_STORE_FILE=${KEYSTORE}
VAN_SALES_KEY_ALIAS=${ALIAS}
VAN_SALES_STORE_PASSWORD=${PASSWORD}
VAN_SALES_KEY_PASSWORD=${PASSWORD}
EOF
  chmod 600 "${GRADLE_PROPS}"
  echo "Created ${KEYSTORE}"
else
  echo "Reusing ${KEYSTORE}"
fi

# Expo generates gradle.properties with -Xmx2048m -XX:MaxMetaspaceSize=512m.
# KSP running over expo-updates exhausts that metaspace and the build dies
# with "java.lang.OutOfMemoryError: Metaspace" partway through, so raise it.
GRADLE_PROPS_ANDROID="$(dirname "${BUILD_GRADLE}")/../gradle.properties"
if [ -f "${GRADLE_PROPS_ANDROID}" ]; then
  python3 - "${GRADLE_PROPS_ANDROID}" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
wanted = "org.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=2048m"
if wanted in src:
    print("gradle.properties already has enough heap")
else:
    src, n = re.subn(r"^org\.gradle\.jvmargs=.*$", wanted, src, count=1, flags=re.M)
    if n == 0:
        src += "\n" + wanted + "\n"
    open(path, "w").write(src)
    print("Raised JVM heap/metaspace for the Gradle build")
PY
fi

# Point the release build at the release key. Idempotent: if the block is
# already there, leave it alone.
if grep -q "VAN_SALES_STORE_FILE" "${BUILD_GRADLE}"; then
  echo "build.gradle already configured"
  exit 0
fi

python3 - "${BUILD_GRADLE}" <<'PY'
import re, sys

path = sys.argv[1]
src = open(path).read()

release_config = """        release {
            if (project.hasProperty('VAN_SALES_STORE_FILE')) {
                storeFile file(VAN_SALES_STORE_FILE)
                storePassword VAN_SALES_STORE_PASSWORD
                keyAlias VAN_SALES_KEY_ALIAS
                keyPassword VAN_SALES_KEY_PASSWORD
            }
        }
"""

# Add a `release` signing config next to the generated `debug` one.
marker = "    signingConfigs {\n"
if marker not in src:
    sys.exit("could not find signingConfigs block")
src = src.replace(marker, marker + release_config, 1)

# And make the release build type use it instead of the debug key.
src = src.replace(
    "            // Caution! In production, you need to generate your own keystore file.\n"
    "            // see https://reactnative.dev/docs/signed-apk-android.\n"
    "            signingConfig signingConfigs.debug",
    "            signingConfig project.hasProperty('VAN_SALES_STORE_FILE')"
    " ? signingConfigs.release : signingConfigs.debug",
    1,
)

open(path, "w").write(src)
print("Patched", path)
PY
