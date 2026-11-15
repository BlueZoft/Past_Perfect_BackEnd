# Catalogue configuration

`config/catalogue.json` is the default configuration. All geography is illustrative placeholder content; it is not a district directory. Category IDs are starter product choices, not claims about market demand.

```json
{
  "categories": ["other", "clothing", "electronics", "furniture", "books"],
  "locations": [
    {"id": "sample-district", "label": "Example district (placeholder)", "towns": ["Example town"]}
  ]
}
```

Set `CATALOGUE_FILE` to an absolute JSON file path for a reviewed catalogue. Relative paths resolve from the API working directory. Restart the API after changes; no frontend rebuild is needed. GET `/catalogue` supplies the frontend's options and server validation uses the same source. Invalid JSON/configuration fails startup.

Category and district IDs must be unique lowercase slugs (up to 80 characters). Categories must include `other`. Location labels and town names must be unique/nonempty within their parent as appropriate, trimmed, up to 120 characters. Empty location is allowed; a town requires a district and must belong to it. No exact street/address/geolocation is collected.

Clothing supports the existing typed `size` enum. Other categories reject size; additional attributes need explicit schema/UI validation before being added. Do not silently repurpose a category/district ID already used by listings. This release performs no automatic migration when a catalogue changes. Existing records may require a separate migration if IDs are removed or renamed.

Tests explicitly use the bundled fixture catalogue and disposable databases, regardless of deployment configuration. Obtain and review actual geography separately before launch. No secret credentials belong in this public catalogue.


## Typed attributes (v2.6)

An optional `attributes` object maps category IDs to up to 8 field definitions. Each field has a unique non-reserved key, localized `label` (en/si/ta), `type` (text/number/enum), and optional boolean `required`. Text requires `maxLength` from 1–200; numbers require finite `min`/`max`; enums require 1–30 unique string `values`. Example:

```json
{"attributes":{"electronics":[{"key":"brand","type":"text","maxLength":80,"label":{"en":"Brand","si":"වෙළඳ නාමය","ta":"வணிகப் பெயர்"}}]}}
```

Starter fields in the bundled catalogue are product examples, not external service/market data. Optional attributes may be omitted. Values outside the active category or nested/operator-like objects are rejected. Numeric strings from multipart/HTML inputs become numbers on the server. Unknown keys are never mass-assigned. Existing attributes are retained only when valid for the edited category; the frontend clears them on category changes. Add reviewed dictionary entries for new enum labels if their canonical values need localization. Attribute search indexing/filtering is a future enhancement.
