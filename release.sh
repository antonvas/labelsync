#!/bin/sh

show_usage() {
  echo "Usage: ./release.sh VERSION"
  echo ""
  echo "Creates release packages for Chrome and Firefox extensions"
  echo ""
  echo "Arguments:"
  echo "  VERSION    Version number for the release (required)"
  echo "             Example: ./release.sh 1.2.3"
}

# Show usage if -h or --help is passed
if [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ -z "$1" ]; then
  show_usage
  exit 0
fi

RELEASE_VERSION="$1"

npm run build
sed -i "s/0.0.1/$RELEASE_VERSION/" dist/manifest.json
zip -r -j labelsync-$RELEASE_VERSION.zip dist/*
node build/add_firefox_details.js
zip -r -j labelsync-firefox-$RELEASE_VERSION.zip dist/*
