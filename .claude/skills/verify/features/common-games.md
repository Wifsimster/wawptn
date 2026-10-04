# Common games

The group page lists the games that every member (or the owner's threshold of members) owns, across Steam, Epic and GOG libraries. It suggests one game for tonight ("Idée pour ce soir"), lets the group pick one at random ("Au hasard"), and filters the list by multiplayer, co-op, free and preset moods.

## Sub-features

- `common-list` shows "Jeux en commun (N)" with a search box.
- `common-filters` toggles "Multijoueur", "Coopératif", the "Plus de filtres" panel and the mood presets ("Soirée coop", "Canapé coop", "Party multi", "Top notés").
- `tonight-pick` shows the "Idée pour ce soir" card.
- `random-pick` picks a game with "Au hasard".
- `wishlist` adds a game with "Ajouter à ma liste d'envies".

## How to get to it (user POV)

- `/groups/<id>`, tab "Ce soir".
- `/library` lists the player's own library; `/compare` compares two players.

## Driving it with control-wawptn

Preconditions:

- A fresh `$C launch`, `$C doctor` exits 0, and a group with alice, bob and carol (see [group-invite.md](./group-invite.md)).

- **List.** Run `$C goto /groups/<id>`, then `$C snapshot --selector main`. Expect `heading "Jeux en commun (4)"` and the four common fake games as list items. `Solo Sandbox Sim` (alice and bob only) and `Lonely Lighthouse` (alice only) must not appear. Second read: `docker exec wawptn-verify-pg psql -U wawptn -d wawptn -c "select game_name, count(*) from user_games group by 1 order by 2 desc"`.
- **Threshold.** Remove carol from the group, or start a vote with only alice and bob checked: `Solo Sandbox Sim` joins the set (5 games).
- **Filters.** Run `$C click --role button --name "^Coopératif$"`, then `$C snapshot --selector main`. Every fake game has `is_coop = true`, so the list stays at 4. To prove filtering, first set one game to `is_coop = false` in `game_metadata`, and say so in the evidence.
- **Random pick.** Run `$C click --role button --name "^Au hasard$"`, then `$C screenshot --name random-pick` and `$C snapshot`.

## Gotchas

- The fake games carry `game_metadata` rows marked as enriched. Without them the group page queues a Steam store lookup, which the egress guard refuses.
- Images come from the Steam CDN. The browser daemon answers them with a "fake <appId>" placeholder, so a screenshot never shows real cover art.
- The "Multijoueur" filter is on by default on the group page.
