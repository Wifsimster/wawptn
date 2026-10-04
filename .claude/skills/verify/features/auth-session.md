# Sign-in and session

Players sign in with Steam OpenID 2.0 only. After the Steam callback the backend creates the user (first time), writes a `sessions` row, sets the signed httpOnly cookie `wawptn.session_token` (7 days), and starts a background library sync. `GET /api/auth/me` tells the SPA who is signed in.

## Sub-features

- `steam-signin` is "Se connecter avec Steam" on the landing page → `steamcommunity.com` → `/api/auth/steam/callback`.
- `session-cookie` is the signed cookie checked by `requireAuth` and by the socket.io handshake.
- `logout` is "Mon Profil" (header) → menu item "Se déconnecter" → confirm.
- `invite-return` sends a signed-out player who opened an invite back to `/join/<token>` after Steam.

## How to get to it (user POV)

- `/` while signed out shows the landing page with "Se connecter avec Steam".
- `/join/<token>` while signed out shows "Connecte-toi avec Steam pour rejoindre le groupe".
- "Mon Profil" in the header → "Se déconnecter".

## Driving it with control-wawptn

Preconditions:

- A fresh `$C launch`, and `$C doctor` exits 0.

- **Session (harness seam).** Run `$C login --as alice`. It inserts a `sessions` row, sets the signed cookie and checks that `/api/auth/me` names "Alice (fake)". This proves the cookie, `requireAuth` and the signed-in shell. It does **not** prove Steam sign-in.
- **Steam sign-in.** Not drivable: it needs `steamcommunity.com` and a real account. Report it as not verified. You can still prove the start of the flow: on the signed-out landing page, `$C click --role link --name "Se connecter avec Steam" --dry-run` finds the link. A real click goes to `/api/auth/steam/login`, which redirects to Steam, and the browser daemon blocks that request (status `blocked` in `network-log`).
- **Logout.** Run `$C click --role button --name "^Mon Profil$"`, then `$C click --role menuitem --name "^Se déconnecter$"`, then confirm in the "Se déconnecter ?" dialog with `$C click --role button --name "^Se déconnecter$"`. The page lands on `/` with the link "Se connecter avec Steam". Second read: `docker exec wawptn-verify-pg psql -U wawptn -d wawptn -At -c "select count(*) from sessions"` dropped by one (7 → 6 in the pilot run).

## Gotchas

- `login` clears every cookie in the shared browser. Switching player also drops the previous player's socket.io connection.
- The cookie is signed with the run's throwaway `APP_SECRET` (kept in `.verify-run/state.json`, never printed by `info`). A cookie from another run is rejected.
- The callback route has a rate limit of 5 per minute. It does not matter for the harness, which never calls it.
