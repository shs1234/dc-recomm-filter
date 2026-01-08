# Publishing to Chrome Web Store

This document describes the manual steps and an example CI flow for publishing the extension.

## Manual upload (quick)
1. Create a Chrome Web Store developer account and pay the one-time developer fee.
2. Go to https://chrome.google.com/webstore/developer/dashboard and click **Add new item**.
3. Prepare a ZIP file of the extension (root should include `manifest.json`), e.g.:
   - npm run package  # creates `dist/dc-recomm-filter.zip`
4. Upload the ZIP, fill in store listing details (title, short/long description), set categories and languages.
5. Add icons and screenshots (1280×800 recommended for at least one screenshot; see `assets/screenshots/README.md`).
6. Fill in **Privacy Policy** and any required contact details.
7. Save and publish; the item will be reviewed by Google.

## Required notes
- Make sure `manifest.json` has the minimal necessary permissions. Avoid excessive host permissions.
- Provide a clear privacy policy if you use `storage`, `tabs`, or other APIs that access user data.

## Automated publishing (optional)
You can automate packaging and uploading using CI (GitHub Actions) + Chrome Web Store API. High level steps:
1. Create a Google API project and enable Chrome Web Store API.
2. Create OAuth client credentials and obtain a refresh token for the account that owns the developer item.
3. Store `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` as repository secrets.
4. Use an existing GitHub Action or write a script that exchanges the refresh token for an access token, then uploads the ZIP and publishes it.

### Example (GitHub Actions job outline)
```yaml
name: Publish Chrome Extension
on:
  workflow_dispatch:
  push:
    branches: [ main ]

jobs:
  package-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Package extension
        run: npm ci && npm run package
      - name: Upload to Chrome Web Store
        env:
          CLIENT_ID: ${{ secrets.CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.CLIENT_SECRET }}
          REFRESH_TOKEN: ${{ secrets.REFRESH_TOKEN }}
        run: |
          # Implement upload logic here (curl or node script)
          echo "Upload step — implement with your preferred tool"
```

References:
- Chrome Web Store API docs: https://developer.chrome.com/docs/webstore/using_webstore_api/

If you want, I can add a complete action that uses a small Node script to upload and publish (requires you to provide secrets).