# Groups and invites

A signed-in player creates a group and gets an invite link at once. Friends open the link, and once signed in they join the group in one step. The invite token is hashed in the DB, expires after 72 hours, and allows 10 uses by default.

## Sub-features

- `group-create` creates a group from `/` and makes the creator its owner.
- `invite-link` shows the invite link in the "Invite tes amis dès maintenant" dialog (copy, Discord share).
- `invite-join` joins the group from `/invite/<token>` (backend page with Open Graph tags, then redirect to `/join/<token>`).
- `join-with-code` joins from "Rejoindre avec un code" on `/`.
- `members` lists the members in the group page tab "Membres".

## How to get to it (user POV)

- `/` → button "Créer" (header) or "Créer mon premier groupe" (empty state).
- The invite link from the dialog, `http://localhost:5173/invite/<token>`, opened by another player.
- `/` → "Rejoindre avec un code" (paste the token or link).
- `/groups/<id>` → tab "Membres".

## Driving it with control-wawptn

Preconditions:

- A fresh `$C launch`, and `$C doctor` exits 0.

- **Create.** Run `$C login --as alice`, then `$C group create --name "Soirée test"`. The JSON shows `response.status 201`, `inviteShown` with the token from the response, `members` = Alice as `owner`, and `url` = `/groups/<id>`. `group-created-invite.png` shows the invite dialog.
- **Join through the link.** Run `$C login --as bob`, then `$C group join`. Expect `landedOnGroup: true`, `errorShown: false`, Bob in `members` as `member`, and every entry of `joinResponses` with status 200. Repeat as `carol`.
- **Second read.** Run `$C group show`. `inviteUseCount` equals the number of players who joined, and `members` lists all of them.
- **Realtime.** `member:joined` goes to pages already in the group room. The harness has one browser and one player at a time, so the joiner's own page never receives it. Do not claim it from this harness; `group:presence` frames after a join are the observable part.
- **Join with a code.** Not wrapped. Run `$C click --role button --name "Rejoindre avec un code"`, then `$C snapshot` and fill the dialog by its label.

## Gotchas

- Before PR #247, the join page fired two `POST /api/groups/join` in dev (React StrictMode). One answered 500 (`group_members_pkey`), and the page showed "Impossible de rejoindre" although the row existed. `joinResponses` shows both requests. On a fixed backend the second one answers 200 with `alreadyMember: true`.
- The invite link only works because `launch` sets `API_URL` to the Vite origin. With `API_URL=http://localhost:3000` the redirect lands on an Express 404 (`Cannot GET /join/...`).
- A non-premium player can own 2 groups. The third `group create` answers 403.
- A player removed from a group is banned from rejoining through a live link (403 `banned`).
