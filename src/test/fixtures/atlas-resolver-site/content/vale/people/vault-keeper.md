---
title: Vault Keeper
atlas:
  type: npc
  visibility: player
  placements:
    - { mapId: vale, x: 150, y: 150 }
    - { mapId: vale, x: 120, y: 400, secretId: hidden-door }
  secrets:
    - id: hidden-door
      password: "low tide"
      teaser: "a door under the pier"
      reveal: "the door opens at low tide"
---

# Vault Keeper

Keeps the vault. {{secret:hidden-door}}
