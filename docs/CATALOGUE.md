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
