# #11632 LifeOps Live-Validation Status

Generated: 2026-07-04T10:26:43.255Z

Verdict: **not closeable**. This is a read-only status artifact; live OAuth,
account, sandbox, and physical-device rows still need operator evidence.

| Surface | Status | Required | Present env names | Missing |
|---|---|---|---|---|
| Live model provider | ready | one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, CEREBRAS_API_KEY, ELIZA_LIVE_TEST_LOCAL_LLAMA_CPP_BASE_URL | CEREBRAS_API_KEY | none |
| Google Calendar / Gmail | blocked | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI | none | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI |
| Discord | blocked | one of: DISCORD_API_TOKEN, DISCORD_BOT_TOKEN | none | DISCORD_API_TOKEN, DISCORD_BOT_TOKEN |
| Telegram | blocked | TELEGRAM_BOT_TOKEN | none | TELEGRAM_BOT_TOKEN |
| Slack | blocked | SLACK_BOT_TOKEN, SLACK_APP_TOKEN | none | SLACK_BOT_TOKEN, SLACK_APP_TOKEN |
| Signal | blocked | SIGNAL_ACCOUNT_NUMBER | none | SIGNAL_ACCOUNT_NUMBER, SIGNAL_HTTP_URL, SIGNAL_CLI_PATH |
| WhatsApp | blocked | ELIZA_WHATSAPP_ACCESS_TOKEN, ELIZA_WHATSAPP_PHONE_NUMBER_ID | none | ELIZA_WHATSAPP_ACCESS_TOKEN, ELIZA_WHATSAPP_PHONE_NUMBER_ID |
| X | blocked | one of: X_API_KEY, TWITTER_API_KEY, TWITTER_BEARER_TOKEN | none | X_API_KEY, TWITTER_API_KEY, TWITTER_BEARER_TOKEN |
| Phone / SMS / Voice | blocked | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN | none | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN |
| Health | blocked | one of: ELIZA_HEALTHKIT_CLI_PATH, ELIZA_GOOGLE_FIT_ACCESS_TOKEN, FITBIT_ACCESS_TOKEN, OURA_ACCESS_TOKEN, STRAVA_ACCESS_TOKEN, WITHINGS_ACCESS_TOKEN | none | ELIZA_HEALTHKIT_CLI_PATH, ELIZA_GOOGLE_FIT_ACCESS_TOKEN, FITBIT_ACCESS_TOKEN, OURA_ACCESS_TOKEN, STRAVA_ACCESS_TOKEN, WITHINGS_ACCESS_TOKEN |
| Finances | blocked | one of: LIFEOPS_FINANCE_CSV_FIXTURE, PLAID_CLIENT_ID, PLAID_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET | none | LIFEOPS_FINANCE_CSV_FIXTURE, PLAID_CLIENT_ID, PLAID_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET |
| iOS / macOS native permissions | blocked | one of: ELIZA_IMESSAGE_BACKEND, ELIZA_NATIVE_PERMISSIONS_DYLIB, ELIZA_HEALTHKIT_CLI_PATH | none | ELIZA_IMESSAGE_BACKEND, ELIZA_NATIVE_PERMISSIONS_DYLIB, ELIZA_HEALTHKIT_CLI_PATH |
| Android native permissions | blocked | one of: ANDROID_SERIAL | ANDROID_HOME, ANDROID_SERIAL | online adb device 27051JEGR10034 |

## Device Tooling

| Tool | Available | Summary |
|---|---:|---|
| adb | yes | List of devices attached |
| xcrun | yes | == Devices ==<br>-- iOS 18.1 --<br>iPhone 16 Pro (F165C3A3-5069-4174-A40C-89F0BCC4B9FB) (Booted)<br>iPhone 16 Pro Max (F4F00A69-AA73-4AF7-9729-22B72088E2EC) (Shutdown)<br>iPhone 16 (39F890C2-072D-4BFE-9144-5327AF30B10A) (Shutdown) |
| devicectl | yes | Name            Hostname                        Identifier                             State                Model<br>-------------   -----------------------------   ------------------------------------   ------------------   ------------------------------<br>MoonCycles      MoonCycles.coredevice.local     59EBB356-BC44-5AA2-91F1-E6AAE756BB86   available (paired)   iPhone 16 Pro Max (iPhone17,2)<br>Shaw’s iPhone   Shaws-iPhone.coredevice.local   C9130C48-48F1-5DC3-98E9-8BACE231D047   available (paired)   iPhone 15 Pro (iPhone16,1)<br>Failed to load provisioning paramter list due to error: Error Domain=com.apple.dt.CoreDeviceError Code=1002 "No provider was found." UserInfo={NSLocalizedDescription=No provider was found.}. |

## Existing Evidence

- present: `.github/issue-evidence/8833-lifeops-live-validation/README.md`
- present: `.github/issue-evidence/8833-lifeops-live-validation/2026-07-02-keyless-run/README.md`
- present: `.github/issue-evidence/8833-lifeops-live-validation/2026-07-02-keyless-run/owner-agent-permission-matrix.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/2026-07-02-keyless-run/connector-keyless-suites.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/owner-agent-permission-matrix.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/android-build-after-resolved-appdir.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/android-app-actions-test.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/biome-edited-files.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/core-build-node.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/core-typecheck.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/agent-typecheck.txt`
- present: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/plugin-discord-typecheck.txt`
- missing: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/plugin-google-live.txt`
- missing: `.github/issue-evidence/8833-lifeops-live-validation/11632-status/plugin-x-live.txt`
