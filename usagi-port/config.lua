local C = {}

C.game_width = 480
C.game_height = 270

C.tile_size = 16
C.world_columns = 20
C.world_rows = 12
C.world_offset_x = 80
C.world_offset_y = 32
C.bottom_ui_y = 230

C.villager_speed = 31
C.defender_speed = 38
C.day_length = 42
C.max_days = 5
C.win_prosperity = 100
C.starting_morale = 100
C.max_visible_villagers = 7
C.tower_range = 56
C.tower_damage_per_second = 9.5

C.color = {
  deep = 1,
  panel = 5,
  panel_dark = 6,
  parchment = 16,
  gold = 11,
  grass = 12,
  grass_dark = 4,
  forest = 4,
  water = 13,
  stone = 7,
  berry = 9,
  wood = 5,
  danger = 9,
  blue = 13,
  white = 8,
  ink = 1,
}

C.starting_resources = {
  wood = 36,
  stone = 20,
  food = 26,
  gold = 11,
}

C.buildings = {
  hut = {
    kind = "hut",
    label = "Hut",
    hotkey = "1",
    cost = { wood = 14, stone = 3, food = 6, gold = 0 },
    prosperity = 16,
    build_time = 7,
    description = "+villager, +gold at dawn",
  },
  farm = {
    kind = "farm",
    label = "Farm",
    hotkey = "2",
    cost = { wood = 16, stone = 2, food = 0, gold = 3 },
    prosperity = 13,
    build_time = 8,
    description = "grows food over time",
  },
  tower = {
    kind = "tower",
    label = "Tower",
    hotkey = "3",
    cost = { wood = 18, stone = 16, food = 0, gold = 7 },
    prosperity = 24,
    build_time = 10,
    description = "fires at night hazards",
  },
}

C.building_order = { "hut", "farm", "tower" }

C.upgrades = {
  villager_speed = {
    kind = "villager_speed",
    label = "Boots",
    hotkey = "4",
    max_level = 3,
    costs = {
      { wood = 16, stone = 0, food = 8, gold = 5 },
      { wood = 24, stone = 4, food = 10, gold = 9 },
      { wood = 34, stone = 8, food = 14, gold = 14 },
    },
    description = "villagers move faster",
  },
  tower_damage = {
    kind = "tower_damage",
    label = "Arrows",
    hotkey = "5",
    max_level = 3,
    costs = {
      { wood = 10, stone = 12, food = 0, gold = 7 },
      { wood = 14, stone = 18, food = 0, gold = 12 },
      { wood = 20, stone = 26, food = 0, gold = 18 },
    },
    description = "towers hit harder",
  },
  farm_yield = {
    kind = "farm_yield",
    label = "Seeds",
    hotkey = "6",
    max_level = 3,
    costs = {
      { wood = 10, stone = 0, food = 12, gold = 6 },
      { wood = 16, stone = 0, food = 18, gold = 10 },
      { wood = 24, stone = 4, food = 26, gold = 15 },
    },
    description = "farms grow more food",
  },
}

C.upgrade_order = { "villager_speed", "tower_damage", "farm_yield" }
C.priority_order = { "gather", "build", "defend" }

return C
