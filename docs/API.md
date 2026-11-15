# API v2 contract

JSON errors have `{ "error": "message" }` and appropriate 4xx/5xx status codes. Mutation requests require `Origin: <WEB_ORIGIN>`; cookie-authenticated browser requests must include credentials. Signup/login use JSON. Avatar upload is no longer part of signup.

| Method | Route | Request / result |
| --- | --- | --- |
| POST | `/user/signup` | `{email, username, password}` → 201 public user + session cookie |
| POST | `/user/login` | `{email, password}` → 200 public user + new session cookie; 401 on mismatch |
| GET | `/user/me` | Session required → public user, otherwise 401 |
| POST | `/user/logout` | Session required → 204, revoke session and clear cookie |
| GET | `/offers` | Filtered active listings and pagination metadata |
| GET | `/offer/:id` | Listing with public seller; 400 invalid ID, 404 absent/removed |
| POST | `/offer/publish` | Session + multipart fields and files → 201 listing |
| POST | `/payment` | Session required → 503; no charge or order is created |

Public user: `{_id, email, account: {username, avatar?}}`. No token/hash is returned. Passwords must be at least 8 characters and at most 72 UTF-8 bytes, reflecting bcrypt limits. Emails are normalized to lowercase; usernames are 1–80 characters.

Listing:

```json
{
  "_id": "<mongodb-object-id>",
  "title": "Used book",
  "description": "A book in good condition",
  "price": 1000,
  "currency": "LKR",
  "size": "",
  "condition": "Used",
  "images": [{"url": "/uploads/<generated-name>.png", "publicId": "<generated-name>.png"}],
  "status": "active",
  "owner": {"_id": "<seller-id>", "account": {"username": "Example seller"}},
  "createdAt": "<ISO timestamp>",
  "updatedAt": "<ISO timestamp>"
}
```

All sample identifiers/content are illustrative placeholders. Cloudinary image URLs are absolute HTTPS URLs; local image URLs are relative to the API origin. Missing/deleted sellers may populate as null.

Publish fields: `title` (3–120 characters), `description` (10–4000), `price` (integer LKR, 1–1,000,000,000), `condition`, optional `size`, and 1–3 files under `picture1`, `picture2`, `picture3`. Unicode content is accepted. Conditions: `New with Tags`, `Like New`, `Fairly Used`, `Used`, `Worn`. Sizes: empty, XS, S, M, L, XL, XXL. The upper price bound is a configurable business-policy follow-up, not a researched market limit.

Discovery query: `title` (literal case-insensitive search, maximum 120 characters), `priceMin`/`priceMax` (nonnegative integers), `sort` (`newest`, `price-asc`, `price-desc`), `page` (1–100000), `limit` (1–50, default 10). Response: `{count, page, limit, offers}`. Sorts include an ID tie-breaker. These filters are bounded but title search is not yet an indexed full-text service.


## Seller management (v2.1)

All routes require a session; mutations require the configured Origin. Listings include Mongoose's integer `__v`. Send that value as `version` for PATCH/DELETE; do not increment it client-side.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/user/offers` | `{count,page,limit,offers}` for the current owner, excluding removed records. Supports existing title/price/sort/page/limit plus optional `status=active`, `reserved` or `sold`. |
| PATCH | `/offer/:id` | JSON `{title,description,price,condition,size?,version}`; complete editable details required, photos retained. Returns updated listing. Only active/reserved listings. |
| PATCH | `/offer/:id/status` | JSON `{status,version}`; active → reserved/sold, reserved → active/sold. Returns updated listing. |
| DELETE | `/offer/:id` | JSON `{version}`; soft removal from any current state, returns 204. |

Missing/invalid versions and unexpected fields return 400. Invalid transitions and stale updates return 409; reload the listing before retrying. Nonexistent, removed and other owners' listings return 404 for mutations. Anonymous requests return 401. Owner pagination defaults to 10 records and caps at 50. Removed assets are retained pending an explicit retention/purge policy; this is not permanent data erasure.
