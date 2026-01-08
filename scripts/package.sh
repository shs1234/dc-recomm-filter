#!/usr/bin/env sh
set -e

# Create distributable zip for Chrome Web Store
DIST_DIR="dist"
ZIP_NAME="dc-recomm-filter.zip"

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/$ZIP_NAME"

# Exclude dev files and common ignores
zip -r "$DIST_DIR/$ZIP_NAME" . -x "node_modules/*" "tests/*" ".git/*" "dist/*" "*.DS_Store" "*.sh" "scripts/*"

echo "Created $DIST_DIR/$ZIP_NAME"