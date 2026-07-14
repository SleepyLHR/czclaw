# Artifact Image/SVG Share Integration

Date: 2026-06-10

## Server Contract

- `/api/html-shares` now accepts `sourceType=image_file` and `sourceType=svg_file` in addition to `html_file`.
- Share lookup by source continues to use `/api/html-shares/source?sourceType=...&clientSourceKey=...&includeDisabled=true`.
- Public share URLs stay under `/s/{shareId}/`; user-facing pages must not expose NOS object URLs.
- Image and SVG content are uploaded as a single-file zip archive with `entryFile` pointing to the image/SVG file.
- Image uploads accept at most 20 MB original input. JPEG/PNG files at or below 300 KB are uploaded unchanged after type and decode validation. Larger JPEG/PNG files are normalized before uploading to NOS with a 2 MB target stored size. The server prefers a maximum edge of 1600 px and can step down to 640 px when needed. If no candidate reaches 2 MB, the server uploads the smallest candidate instead of rejecting the share. JPEG and non-alpha PNG are stored as JPEG; transparent PNG remains PNG. GIF and WEBP are not transcoded and can be uploaded as long as they fit the 20 MB original input limit.
- Image share pages load displayed content through `/s/{shareId}/content/?preview=1`, which returns the already-normalized same-origin content. `/s/{shareId}/content/` is also proxied by the server and must not redirect to NOS.
- Server moderation may use the server-side image URL for model review, following the existing moderation strategy. User display uses the proxied share content path.

## Client Requirements

- Use `htmlShare:createFromArtifactFile`, `htmlShare:updateFromArtifactFile`, and `htmlShare:getByArtifactFile` for image/SVG artifacts.
- Supported image extensions: PNG, JPG/JPEG, GIF, WEBP.
- SVG sharing is limited to inline/local SVG content. Remote SVG URLs are rejected.
- Client-side image packaging should reject inputs above 20 MB before upload; the server remains authoritative for the 20 MB original input limit and the 2 MB best-effort compression target.
- Client source key rules:
  - Local file: `sha256("{sourceType}:file:{normalizedPath}")`
  - Inline/remote artifact: `sha256("{sourceType}:artifact:{sessionId}:{artifactId}")`
- Existing HTML sharing remains on `html_file` and `createFromHtmlFile/updateFromHtmlFile/getByHtmlFile`.

## Security Notes

- The public share page embeds image/SVG content through same-origin `/s/{shareId}/content/` or `/s/{shareId}/content/?preview=1`.
- NOS stores the normalized image for supported JPEG/PNG uploads, not the raw original image.
- Server sets share-code cookies with `HttpOnly` and `SameSite=Lax`.
- Server blocks cross-site subresource requests for protected content and returns same-origin resource policy headers.
- SVG is validated on both client and server; server validation is authoritative.
