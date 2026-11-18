# Past Perfect API documentation

Current implementation: **v3.0.0**, audited against backend `aa07731` and web `2abc119`. This repository owns API contracts, configuration, persistence/worker rules and operator commands. The companion [marketplace handbook](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/README.md) owns platform introduction, architecture, workflows and buyer/seller/admin/demo guides.

| Need | Maintained document |
| --- | --- |
| HTTP requests, identity/version rules, errors | [API reference](reference/api.md) |
| Environment variables and placeholders | [Environment reference](configuration/environment.md) |
| Verification, recovery and mail | [Account/email configuration](configuration/accounts.md) |
| Catalogue, geography and typed metadata | [Catalogue](configuration/catalogue.md) |
| Keyword/attribute search, presets and alert scans | [Search and alerts](configuration/search.md) |
| Collection orders, disputes and reviews | [Order workflow](workflows/orders.md) |
| Media/worker/admin/health operations | [Operations](operations/operations.md) |
| Reproduce the local milestone and scope limits | [Local release checklist](operations/local-release.md) |
| Remaining responsibilities | [Roadmap](planning/roadmap.md) |
| Earlier implementation behavior | [Release history](releases/history.md), [historical API evolution](releases/api-evolution.md) |

The current platform/architecture [source map](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/reference/source-map.md) links claims to the code in both repositories. Old top-level files remain redirect pages for previously shared URLs. Runtime source and current subject guides take precedence over historical release notes.

Payments/refunds/reviews are test-only; no actual gateway, settlement, carrier, legal-policy/geography research or live deployment is implied. Local outbox/storage can run without external credentials; actual service values stay placeholders until configured securely. The recorded v3.0 checks were 94 API tests, 75 frontend tests and a production frontend build; the documentation audit validates source/navigation rather than claiming a new live/provider/browser assessment.
