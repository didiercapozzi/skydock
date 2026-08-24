#!/bin/bash
set -eo pipefail

BUMP="${1:-patch}"

CURRENT=$(node -p "require('./package.json').version")
echo "Current version: ${CURRENT}"

npm version "${BUMP}" --no-git-tag-version

NEW=$(node -p "require('./package.json').version")
echo "New version: ${NEW}"

git add package.json package-lock.json
git commit -m "release: v${NEW}"
git tag "v${NEW}"
git push origin HEAD --tags

echo "Released v${NEW}"
