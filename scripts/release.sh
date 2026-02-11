#!/usr/bin/env bash
set -euo pipefail

echo "Last 5 releases:"
git tag --sort=-v:refname | head -5 | sed 's/^/  /'
echo ""

LATEST=$(git tag --sort=-v:refname | head -1)
read -rp "New version (latest ${LATEST:-none}): " VERSION

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: version must match vX.Y.Z (e.g. v0.3.0)"
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "Error: working tree is dirty. Commit or stash changes first."
    exit 1
fi

if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "Error: tag $VERSION already exists"
    exit 1
fi

sed -i '' "s|go install github.com/Waraq-Labs/review-for-agent@v[0-9]*\.[0-9]*\.[0-9]*|go install github.com/Waraq-Labs/review-for-agent@${VERSION}|" README.md

CHANGED=$(git status --porcelain -- README.md)
if [ -z "$CHANGED" ]; then
    echo "Error: README.md was not modified — is the version already ${VERSION}?"
    exit 1
fi

UNEXPECTED=$(git status --porcelain | grep -v '^ M README.md' || true)
if [ -n "$UNEXPECTED" ]; then
    echo "Error: unexpected changes beyond README.md:"
    echo "$UNEXPECTED"
    git checkout -- README.md
    exit 1
fi

git add README.md
git commit -m "release ${VERSION}"
git tag "$VERSION"
git push origin main "$VERSION"

echo "Released ${VERSION}"
