#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${AGENT_ROOT}/../.." && pwd)"
OUTPUT_DIR="${PROJECT_ROOT}/backend/agent_downloads"
WORK_DIR="$(mktemp -d)"
AGENT_VERSION="${AGENT_VERSION:-0.1.0}"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require go
require zip
require tar
require ar

mkdir -p "${OUTPUT_DIR}"

TARGETS=(
  "windows amd64"
  "windows arm64"
  "linux amd64"
  "linux arm64"
  "darwin amd64"
  "darwin arm64"
)

create_readme() {
  local dest="$1"
  cat >"${dest}/README.txt" <<EOF
ScropIDS Agent

Quick Start:
1) Set environment:
   SCROPIDS_API_BASE=https://your-domain/api/v1
   SCROPIDS_ORG_SLUG=your-organization-slug
   SCROPIDS_ENROLLMENT_TOKEN=your-one-time-enrollment-token

2) Run:
   - Linux/macOS: ./scropids-agent
   - Windows: .\\scropids-agent.exe

The agent enrolls once, then syncs scheduler profile from server and sends telemetry.
EOF
}

create_sha_file() {
  local artifact_path="$1"
  shasum -a 256 "${artifact_path}" | awk '{print $1}' > "${artifact_path}.sha256"
}

create_deb() {
  local goarch="$1"
  local bin_path="$2"
  local package_file="${OUTPUT_DIR}/scropids-agent-linux-${goarch}.deb"
  local deb_work="${WORK_DIR}/deb-${goarch}"
  local control_dir="${deb_work}/control"
  local data_root="${deb_work}/data"
  local data_dir="${data_root}/usr/local/bin"

  mkdir -p "${control_dir}" "${data_dir}"
  install -m 0755 "${bin_path}" "${data_dir}/scropids-agent"

  cat >"${control_dir}/control" <<EOF
Package: scropids-agent
Version: ${AGENT_VERSION}
Section: utils
Priority: optional
Architecture: ${goarch}
Maintainer: ScropIDS
Description: ScropIDS endpoint telemetry agent
EOF

  echo "2.0" > "${deb_work}/debian-binary"
  (
    cd "${control_dir}" && tar -czf "${deb_work}/control.tar.gz" .
  )
  (
    cd "${data_root}" && tar -czf "${deb_work}/data.tar.gz" .
  )
  (
    cd "${deb_work}" && ar r "${package_file}" debian-binary control.tar.gz data.tar.gz >/dev/null
  )
  create_sha_file "${package_file}"
}

create_dmg() {
  local goarch="$1"
  local pkg_dir="$2"
  if ! command -v hdiutil >/dev/null 2>&1; then
    echo " ! hdiutil not found; skipping dmg for darwin/${goarch}"
    return
  fi
  local dmg_file="${OUTPUT_DIR}/scropids-agent-darwin-${goarch}.dmg"
  hdiutil create -quiet -volname "ScropIDS Agent ${goarch}" -srcfolder "${pkg_dir}" -ov -format UDZO "${dmg_file}"
  create_sha_file "${dmg_file}"
}

create_macos_app_bundle() {
  local goarch="$1"
  local bin_path="$2"
  local pkg_dir="$3"
  local app_dir="${pkg_dir}/ScropIDS Agent.app"
  local contents_dir="${app_dir}/Contents"
  local macos_dir="${contents_dir}/MacOS"
  local resources_dir="${contents_dir}/Resources"

  mkdir -p "${macos_dir}" "${resources_dir}"
  install -m 0755 "${bin_path}" "${resources_dir}/scropids-agent"

  cat >"${macos_dir}/ScropIDSAgentLauncher" <<'EOF'
#!/usr/bin/env bash
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${APP_ROOT}/Resources/scropids-agent"
/usr/bin/osascript <<OSA
tell application "Terminal"
  activate
  do script quoted form of "${BIN}"
end tell
OSA
EOF
  chmod +x "${macos_dir}/ScropIDSAgentLauncher"

  cat >"${contents_dir}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>ScropIDS Agent</string>
  <key>CFBundleIdentifier</key>
  <string>app.scropids.agent.${goarch}</string>
  <key>CFBundleVersion</key>
  <string>${AGENT_VERSION}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>ScropIDSAgentLauncher</string>
</dict>
</plist>
EOF
}

echo "Building ScropIDS agent artifacts..."
for target in "${TARGETS[@]}"; do
  read -r GOOS GOARCH <<<"${target}"
  PKG_DIR="${WORK_DIR}/pkg-${GOOS}-${GOARCH}"
  mkdir -p "${PKG_DIR}"

  BIN_NAME="scropids-agent"
  if [[ "${GOOS}" == "windows" ]]; then
    BIN_NAME="${BIN_NAME}.exe"
  fi
  BIN_PATH="${PKG_DIR}/${BIN_NAME}"

  echo " - ${GOOS}/${GOARCH}"
  (
    cd "${AGENT_ROOT}"
    CGO_ENABLED=0 GOOS="${GOOS}" GOARCH="${GOARCH}" \
      go build -trimpath -ldflags "-s -w" -o "${BIN_PATH}" ./cmd/agent
  )

  create_readme "${PKG_DIR}"

  if [[ "${GOOS}" == "darwin" ]]; then
    create_macos_app_bundle "${GOARCH}" "${BIN_PATH}" "${PKG_DIR}"
  fi

  ZIP_NAME="scropids-agent-${GOOS}-${GOARCH}.zip"
  ZIP_PATH="${OUTPUT_DIR}/${ZIP_NAME}"
  (
    cd "${PKG_DIR}" && zip -q -r "${ZIP_PATH}" .
  )
  create_sha_file "${ZIP_PATH}"

  if [[ "${GOOS}" == "windows" ]]; then
    EXE_PATH="${OUTPUT_DIR}/scropids-agent-windows-${GOARCH}.exe"
    cp "${BIN_PATH}" "${EXE_PATH}"
    create_sha_file "${EXE_PATH}"
  fi

  if [[ "${GOOS}" == "linux" ]]; then
    create_deb "${GOARCH}" "${BIN_PATH}"
  fi

  if [[ "${GOOS}" == "darwin" ]]; then
    create_dmg "${GOARCH}" "${PKG_DIR}"
  fi
done

echo "Artifacts written to ${OUTPUT_DIR}"
