#!/bin/sh
# Builds the app and publishes dist/ to the gh-pages branch (GitHub Pages serves it).
# Used until the repo deploys automatically through .github/workflows/deploy.yml.
set -e
cd "$(dirname "$0")/.."
npm run build
rev=$(git rev-parse --short HEAD)
out=$(mktemp -d)
cp -R dist/. "$out"
touch "$out/.nojekyll"
cd "$out"
git init -q -b gh-pages
git add -A
git commit -qm "Deploy $rev"
git push -q -f https://github.com/kestrelkua/atlas-trading-desk.git gh-pages
echo "Deployed $rev to https://kestrelkua.github.io/atlas-trading-desk/"
