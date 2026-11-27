# Monetization

Apex Serpent Royale keeps gameplay free and uses Telegram-only rewarded ads plus optional promoted links:

- **Rewarded ads:** Monetag TMA zone `12310837` loads after a player requests a revive or booster. Only `reward_event_type: valued` grants the gameplay item. A valued reward starts a 60-second per-session cooldown; failed and skipped ads do not grant items or start the cooldown.
- **Promoted links:** header and in-game cards are labeled as promoted third-party links, open only on a tap, and share a 60-second per-session cooldown. Link selection is deterministic for placement reporting.
- **Display inventory:** banner, social-bar, and in-page-push containers are not connected to approved display placements in this build. They stay hidden or act only as disclosed click-through cards. Add real publisher placement IDs before describing these as CPM banner inventory.

Reward completion is checked in the client and is not an authoritative revenue ledger. Monetag postbacks need a backend endpoint and dashboard secret, neither of which is configured. Verify actual revenue in the publisher dashboard; test builds do not establish earnings.
