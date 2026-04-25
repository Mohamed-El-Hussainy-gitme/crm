# Ahwa Daily Sales Command Center

This pass upgrades the `/prospecting` workflow from a simple Maps intake page into a daily sales operating console.

## Added behavior

- Daily operating plan with target calls, focus area, overdue follow-ups, meetings, and enrichment backlog.
- Backend lead scoring based on phone availability, Google Maps URL, area, contact freshness, due tasks, and pipeline stage.
- Area campaign filtering that recalculates the call queue by territory.
- Command queue sorted by urgency and score.
- Active lead action panel with call, WhatsApp, Maps, score breakdown, next task, call script, and one-click outcomes.
- Follow-up due queue shown separately from cold calls.
- Dedicated tabs for Command, Maps Intake, Enrichment, and Scripts.
- Visual consistency pass for enterprise spacing, panels, action density, and high-contrast hierarchy.

## Backend additions

`GET /api/acquisition/overview` now supports:

```txt
/api/acquisition/overview?area=<area name>
```

The response now includes:

```txt
dailyPlan
followUpDue
meetingsToday
globalCounts
scoreBreakdown
recommendedAction
areaCampaigns.coverage
areaCampaigns.priority
```

## Intended daily workflow

1. Pick a focus area.
2. Work the `Today call queue` from top to bottom.
3. Use the active lead panel during the call.
4. Save the outcome immediately.
5. Move to enrichment only after ready-to-call and due follow-ups are handled.
6. Use Maps intake to add more leads when a territory is under-covered.

## Notes

No new database tables or paid APIs were added. The implementation uses existing CRM tables and Cloudflare Pages Functions.
