# Security policy

## Reporting a problem
Please report security problems privately, not in a public issue.

On GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting must be turned on under Settings > Code security). Include what you found, how to reproduce it, and what you think the impact is.

## What is in scope
The API (`server/`), the game host, the web app (`web/`), the deployment files (`deploy/`) and the GitHub workflows (`.github/`).

## How the project protects itself
See `docs/SECURITY.md` for the controls and how each one is tested, and `docs/GITHUB.md` for the scanning that runs on every change (code scanning, dependency review, secret scanning, container scanning, weekly audits).

## If a secret leaks
Treat it as compromised: rotate it first, investigate second. `docs/DEPLOYMENT.md` lists how to rotate each secret.
