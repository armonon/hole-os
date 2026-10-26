# NOW, Circle and provider boundary

Read-only inspection on 26 October 2026 found no original NOW, Circle or Sessions repository in the available ecosystem checkout. `tcc-operations/audit-lab/registry.json` records `repository: null` and `repository_mapping: unresolved` for `now-messenger`, `circle` and `sessions`. No source or provider connection is inferred from product pages.

The inspected owned source is `tcc-operations/repos/thecreatingco-site` at `1d24b08ad6e072a5984d21d94c243a61b9d7271b`:

- `netlify/functions/community-proxy.cjs`: existing browser gateway.
- `products/now-messenger/index.html`, `products/circle/index.html` and `products/sessions/index.html`: product descriptions and original routes.
- `remix-community.js`: deliberate HTTPS-link submission to the site's private support/moderation form, with pending/error feedback. It explicitly does not claim publication.

That repository's `AGENTS.md` calls it an incomplete historical mirror and requires pinned live-source reconciliation before edits. This inspection made no edits, source downloads, external sends or deployments. Historical source evidence does not establish current production parity.

## Actual gateway contract observed in source

The fixed upstream is `https://momentium-collaboration.armonon.chatgpt.site`. The proxy allowlists `/community`, `/_next/`, `/api/account` and `/api/community` with the exact file/hole/now/network/media/video suffixes in its source. It permits GET, HEAD and POST, rejects unrecognized public hosts, requires the exact public Origin for POST, translates the origin to the fixed upstream, forwards only selected headers and `__Host-momentium-access`, `__Host-momentium-refresh` and `community-guest` cookies, caps POST bytes at 5,000,000 and times out after 24 seconds. External redirects are rejected. A failed fetch returns an actual unavailable error.

This is a transport contract. It does not supply the upstream API request/response schema, account recovery/authorization implementation, room membership rules, encryption protocol, publication/follow semantics, live session transport or deployed function digest parity. Hole's Relay account does not authenticate to these services. The Hole origin is not authorized by this gateway's host policy; no wildcard CORS or cookie workaround is added.

## Distinct retained products and required inputs

NOW retains private conversations, rooms and live sessions; Circle retains public profiles, discovery, project sharing and following. The existing Hole catalog routes remain `https://now-messenger.armonon.chatgpt.site/` and `https://thecreatingco.com/community/network`. Sessions remains an upstream shared-listening surface, not the local Pocket beat sketchpad. No sender, recipient, room presence, follow state, sent/delivered status or E2EE property is fabricated.

Connected implementation requires the original upstream source/export and owner-confirmed deployment mapping; supported versioned API/authentication/CSRF/CORS and grant/revocation contracts; authorized disposable accounts; and a configured service endpoint. Qualification must exercise real recipient access/revocation, explicit sends/publications, genuine pending/failed/confirmed states and reconnect recovery. Live sessions also require their actual signaling/media/queue contracts and multi-client evidence. Mail, calendar and contacts additionally require authorized provider APIs/OAuth scopes and credentials configured outside source/chat. A marketing route or proxy alone cannot satisfy these gates.

Existing Day, Notes, project references, Publish and Relay already cover local preparation. No duplicate draft-only NOW/Circle apps are added to imply that connected integration is complete. The next useful source task is acquiring and inspecting the original upstream contracts, followed by a bounded adapter for the first verified capability. All current routes remain available while that gate is unresolved.
