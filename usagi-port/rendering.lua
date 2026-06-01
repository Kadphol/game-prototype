local Config = require "config"
local World = require "world"

local Rendering = {}

local function round(value)
  return math.floor(value + 0.5)
end

local function tile_to_screen(tile)
  return World.tile_center(tile.column, tile.row)
end

local function compact_cost(cost)
  local parts = {}
  if cost.wood > 0 then table.insert(parts, "W" .. cost.wood) end
  if cost.stone > 0 then table.insert(parts, "S" .. cost.stone) end
  if cost.food > 0 then table.insert(parts, "F" .. cost.food) end
  if cost.gold > 0 then table.insert(parts, "G" .. cost.gold) end
  return table.concat(parts, " ")
end

local function can_afford(resources, cost)
  return resources.wood >= cost.wood
    and resources.stone >= cost.stone
    and resources.food >= cost.food
    and resources.gold >= cost.gold
end

local function resource_color(kind)
  if kind == "wood" then return Config.color.wood end
  if kind == "stone" then return Config.color.stone end
  if kind == "food" then return Config.color.berry end
  return Config.color.gold
end

local function priority_color(priority)
  if priority == "gather" then return Config.color.forest end
  if priority == "build" then return Config.color.wood end
  return Config.color.blue
end

local function draw_panel(x, y, w, h)
  gfx.rect_fill(x, y, w, h, Config.color.panel_dark)
  gfx.rect_fill(x + 2, y + 2, w - 4, h - 4, Config.color.panel)
  gfx.rect(x + 4, y + 4, w - 8, h - 8, Config.color.parchment)
end

local function draw_tree(x, y, scale)
  scale = scale or 1
  gfx.rect_fill(round(x - 2 * scale), round(y - 3 * scale), round(4 * scale), round(8 * scale), Config.color.wood)
  gfx.rect_fill(round(x - 7 * scale), round(y - 12 * scale), round(14 * scale), round(9 * scale), Config.color.forest)
  gfx.rect_fill(round(x - 5 * scale), round(y - 16 * scale), round(10 * scale), round(7 * scale), Config.color.grass_dark)
  gfx.rect_fill(round(x - 3 * scale), round(y - 19 * scale), round(6 * scale), round(5 * scale), Config.color.grass)
end

local function draw_rock(x, y)
  gfx.rect_fill(x - 6, y - 7, 12, 10, Config.color.stone)
  gfx.rect_fill(x - 2, y - 10, 8, 5, Config.color.white)
  gfx.rect_fill(x - 6, y + 1, 12, 3, Config.color.panel_dark)
end

local function draw_bush(x, y, scale)
  scale = scale or 1
  gfx.rect_fill(round(x - 7 * scale), round(y - 9 * scale), round(14 * scale), round(10 * scale), Config.color.grass_dark)
  gfx.rect_fill(round(x - 4 * scale), round(y - 12 * scale), round(8 * scale), round(6 * scale), Config.color.grass)
  gfx.rect_fill(round(x - 4 * scale), round(y - 7 * scale), round(3 * scale), round(3 * scale), Config.color.berry)
  gfx.rect_fill(round(x + 2 * scale), round(y - 9 * scale), round(3 * scale), round(3 * scale), Config.color.berry)
end

local function draw_backdrop(day_timer)
  local night = day_timer < Config.day_length * 0.35
  gfx.clear(night and Config.color.deep or Config.color.grass_dark)
  for y = 0, Config.game_height, 12 do
    for x = 0, Config.game_width, 12 do
      if ((x / 12 + y / 12) % 3) == 0 then
        gfx.rect_fill(x, y, 5, 5, night and Config.color.panel_dark or Config.color.grass)
      end
    end
  end
end

local function draw_tile(tile)
  local center = tile_to_screen(tile)
  local x = center.x - Config.tile_size / 2
  local y = center.y - Config.tile_size / 2
  local color = Config.color.grass

  if tile.terrain == "water" then
    color = Config.color.water
  elseif tile.terrain == "forest" then
    color = Config.color.forest
  elseif ((tile.column + tile.row) % 2) == 0 then
    color = Config.color.grass_dark
  end

  gfx.rect_fill(x, y, Config.tile_size, Config.tile_size, color)
  gfx.rect(x, y, Config.tile_size, Config.tile_size, Config.color.deep)

  if tile.terrain == "forest" then
    draw_tree(center.x, center.y + 2, 0.55)
  elseif tile.terrain == "water" then
    gfx.rect_fill(center.x - 5, center.y - 1, 10, 1, Config.color.white)
    gfx.rect_fill(center.x - 1, center.y + 4, 9, 1, Config.color.white)
  end
end

local function draw_placement_ghost(state)
  local tile = state.tiles[state.cursor.row * Config.world_columns + state.cursor.column + 1]
  if not tile then return end

  local center = tile_to_screen(tile)
  local valid = World.can_place_hovered(state)
  local color = valid and Config.color.gold or Config.color.danger
  local pulse = math.sin(state.cursor.pulse) > 0 and 2 or 0
  gfx.rect_ex(center.x - 7, center.y - 7, 14, 14, 2, color)
  gfx.rect_fill(center.x - 2, center.y - 10 - pulse, 4, 4, color)
end

local function draw_resource_node(node)
  if node.amount <= 0 then return end

  local center = tile_to_screen(node)
  if node.kind == "wood" then
    draw_tree(center.x, center.y + 3, 0.8)
  elseif node.kind == "stone" then
    draw_rock(center.x, center.y + 4)
  else
    draw_bush(center.x, center.y + 4, 0.8)
  end

  gfx.rect_fill(center.x - 6, center.y + 7, 12, 2, Config.color.panel_dark)
  gfx.rect_fill(center.x - 6, center.y + 7, 12 * node.amount / node.max_amount, 2, resource_color(node.kind))
end

local function draw_construction_site(building, center, scale)
  local progress = math.max(0, math.min(1, building.build_progress / building.build_time))
  gfx.rect_fill(center.x - 7 * scale, center.y - 5 * scale, 14 * scale, 11 * scale, Config.color.wood)
  gfx.rect_fill(center.x - 6 * scale, center.y - 9 * scale, 3 * scale, 15 * scale, Config.color.panel)
  gfx.rect_fill(center.x + 4 * scale, center.y - 9 * scale, 3 * scale, 15 * scale, Config.color.panel)
  gfx.rect_fill(center.x - 8, center.y + 9, 16, 2, Config.color.panel_dark)
  gfx.rect_fill(center.x - 8, center.y + 9, 16 * progress, 2, Config.color.gold)
end

local function draw_building(building)
  local center = tile_to_screen(building)
  local scale = 1 + building.pulse * 0.12

  if not building.complete then
    draw_construction_site(building, center, scale)
    return
  end

  if building.kind == "hut" then
    gfx.rect_fill(center.x - 6 * scale, center.y - 2 * scale, 12 * scale, 10 * scale, Config.color.panel)
    gfx.rect_fill(center.x - 8 * scale, center.y - 7 * scale, 16 * scale, 6 * scale, Config.color.wood)
    gfx.rect_fill(center.x - 2 * scale, center.y + 3 * scale, 4 * scale, 5 * scale, Config.color.deep)
    gfx.rect_fill(center.x - 5 * scale, center.y - 10 * scale, 10 * scale, 3 * scale, Config.color.gold)
  elseif building.kind == "farm" then
    gfx.rect_fill(center.x - 7 * scale, center.y - 6 * scale, 14 * scale, 12 * scale, Config.color.wood)
    for index = 0, 3 do
      gfx.rect_fill(center.x - 5 * scale + index * 3 * scale, center.y - 4 * scale, scale + 1, 9 * scale, Config.color.berry)
    end
  else
    gfx.rect_fill(center.x - 4 * scale, center.y - 12 * scale, 8 * scale, 18 * scale, Config.color.stone)
    gfx.rect_fill(center.x - 6 * scale, center.y - 15 * scale, 12 * scale, 4 * scale, Config.color.panel_dark)
    gfx.rect_fill(center.x - 3 * scale, center.y - 18 * scale, 6 * scale, 3 * scale, Config.color.gold)
  end
end

local function draw_task_icon(task, x, y)
  if task == "idle" then return end

  gfx.rect_fill(x - 5, y - 4, 10, 7, Config.color.parchment)
  gfx.rect(x - 5, y - 4, 10, 7, Config.color.panel_dark)
  if task == "gather" then
    gfx.rect_fill(x - 3, y, 5, 2, Config.color.wood)
    gfx.rect_fill(x + 1, y - 3, 2, 2, Config.color.stone)
  elseif task == "build" then
    gfx.rect_fill(x - 3, y - 1, 6, 2, Config.color.wood)
    gfx.rect_fill(x + 1, y - 3, 2, 5, Config.color.stone)
  else
    gfx.rect_fill(x - 3, y - 3, 6, 6, Config.color.blue)
    gfx.rect_fill(x - 1, y - 1, 2, 2, Config.color.white)
  end
end

local function draw_villager(villager)
  local bob = math.sin(villager.step_time) * 1.1
  local x = round(villager.position.x)
  local y = round(villager.position.y + bob)
  local body = Config.color.grass_dark
  if villager.task.kind == "defend" then body = Config.color.blue end
  if villager.task.kind == "build" then body = Config.color.gold end

  gfx.rect_fill(x - 2, y - 6, 4, 6, body)
  gfx.rect_fill(x - 3, y - 10, 6, 4, Config.color.parchment)
  gfx.rect_fill(x - 4, y - 12, 8, 2, Config.color.wood)
  gfx.px(x - 1, y - 8, Config.color.deep)
  gfx.px(x + 2, y - 8, Config.color.deep)

  if villager.carried then
    gfx.rect_fill(x + 3, y - 5, 3, 3, resource_color(villager.carried))
  end

  draw_task_icon(villager.task.kind, x, y - 16)
end

local function draw_king(king)
  local bob = math.sin(king.step_time or 0) * 1
  local x = round(king.position.x)
  local y = round(king.position.y + bob)
  gfx.rect_fill(x - 2, y - 8, 4, 7, Config.color.blue)
  gfx.rect_fill(x - 4, y - 4, 8, 8, Config.color.danger)
  gfx.rect_fill(x - 3, y - 12, 6, 4, Config.color.parchment)
  gfx.rect_fill(x - 4, y - 15, 8, 3, Config.color.gold)
  gfx.rect_fill(x - 2, y - 18, 2, 3, Config.color.gold)
  gfx.rect_fill(x + 1, y - 18, 2, 3, Config.color.gold)
end

local function draw_hazard(hazard)
  local x = round(hazard.position.x)
  local y = round(hazard.position.y)
  local color = hazard.hit_flash > 0 and Config.color.berry or Config.color.danger
  gfx.rect_fill(x - 5, y - 4, 10, 8, color)
  gfx.rect_fill(x - 7, y - 1, 3, 4, color)
  gfx.rect_fill(x + 4, y - 1, 3, 4, color)
  gfx.rect_fill(x - 3, y - 7, 2, 3, Config.color.berry)
  gfx.rect_fill(x + 1, y - 7, 2, 3, Config.color.berry)
  gfx.px(x - 2, y - 1, Config.color.gold)
  gfx.px(x + 2, y - 1, Config.color.gold)
  gfx.rect_fill(x - 6, y + 7, 12, 2, Config.color.panel_dark)
  gfx.rect_fill(x - 6, y + 7, 12 * math.max(0, hazard.health / hazard.max_health), 2, Config.color.danger)
end

local function draw_spawn_warning(warning)
  local pulse = math.sin(warning.timer * 9) > 0 and Config.color.danger or Config.color.gold
  gfx.rect(warning.position.x - 5, warning.position.y - 7, 10, 10, pulse)
  gfx.rect_fill(warning.position.x - 1, warning.position.y - 6, 2, 6, Config.color.white)
  gfx.rect_fill(warning.position.x - 1, warning.position.y + 2, 2, 2, Config.color.white)
end

local function draw_camp_flash(state)
  if state.camp_flash <= 0 then return end

  local camp = World.tile_center(math.floor(Config.world_columns / 2), math.floor(Config.world_rows / 2))
  gfx.rect_ex(camp.x - 13, camp.y - 13, 26, 26, 2, Config.color.danger)
  gfx.rect(camp.x - 9, camp.y - 9, 18, 18, Config.color.danger)
end

local function draw_effects(state)
  for _, attack in ipairs(state.attack_effects) do
    gfx.line_ex(attack.from.x, attack.from.y - 8, attack.to.x, attack.to.y - 3, 2, attack.color)
    gfx.line(attack.to.x - 3, attack.to.y - 3, attack.to.x + 3, attack.to.y - 3, Config.color.white)
    gfx.line(attack.to.x, attack.to.y - 6, attack.to.x, attack.to.y, Config.color.white)
  end

  for _, particle in ipairs(state.particles) do
    gfx.rect_fill(round(particle.position.x), round(particle.position.y), 1, 1, particle.color)
  end

  for _, floating in ipairs(state.floating_texts) do
    gfx.text(floating.text, round(floating.position.x - #floating.text * 2), round(floating.position.y), floating.color)
  end
end

local function draw_progress_bar(x, y, width, value, color)
  gfx.rect_fill(x, y, width, 3, Config.color.panel_dark)
  gfx.rect_fill(x, y, math.max(0, math.min(width, width * value)), 3, color)
end

local function draw_hud(state)
  draw_panel(4, 4, 268, 22)
  gfx.text("Wood " .. state.resources.wood .. "  Stone " .. state.resources.stone .. "  Food " .. state.resources.food .. "  Gold " .. state.resources.gold, 10, 11, Config.color.white)

  draw_panel(282, 4, 194, 44)
  gfx.text("Day " .. state.day .. "/" .. Config.max_days .. "  Morale " .. state.morale .. "%", 290, 11, Config.color.white)
  draw_progress_bar(290, 23, 72, 1 - state.day_timer / Config.day_length, state.day_timer < Config.day_length * 0.35 and Config.color.danger or Config.color.gold)
  draw_progress_bar(374, 23, 72, state.morale / 100, state.morale > 40 and Config.color.grass or Config.color.danger)
  gfx.text("Prosperity " .. state.prosperity .. "/" .. Config.win_prosperity, 290, 32, Config.color.parchment)

  draw_panel(4, Config.bottom_ui_y, 120, 36)
  gfx.text("Priority", 10, Config.bottom_ui_y + 6, Config.color.white)
  for index, priority in ipairs(Config.priority_order) do
    local x = 10 + (index - 1) * 36
    gfx.rect_fill(x, Config.bottom_ui_y + 18, 31, 11, state.priority == priority and Config.color.gold or priority_color(priority))
    gfx.text(string.sub(string.upper(priority), 1, 3), x + 4, Config.bottom_ui_y + 20, state.priority == priority and Config.color.deep or Config.color.white)
  end

  draw_panel(130, Config.bottom_ui_y, 178, 36)
  for index, kind in ipairs(Config.building_order) do
    local definition = Config.buildings[kind]
    local x = 136 + (index - 1) * 57
    local selected = state.selected_building == kind
    local affordable = can_afford(state.resources, definition.cost)
    gfx.rect_fill(x, Config.bottom_ui_y + 7, 52, 22, selected and Config.color.gold or affordable and Config.color.parchment or Config.color.panel)
    gfx.rect(x, Config.bottom_ui_y + 7, 52, 22, Config.color.panel_dark)
    gfx.text(definition.hotkey .. " " .. definition.label, x + 3, Config.bottom_ui_y + 10, Config.color.deep)
    gfx.text(compact_cost(definition.cost), x + 3, Config.bottom_ui_y + 20, Config.color.deep)
  end

  draw_panel(314, Config.bottom_ui_y, 162, 36)
  gfx.text("Upgrades", 321, Config.bottom_ui_y + 5, Config.color.white)
  for index, kind in ipairs(Config.upgrade_order) do
    local definition = Config.upgrades[kind]
    local level = state.upgrades[kind]
    local maxed = level >= definition.max_level
    local cost = maxed and nil or definition.costs[level + 1]
    local affordable = cost ~= nil and can_afford(state.resources, cost)
    local y = Config.bottom_ui_y + 8 + index * 8
    gfx.text(definition.hotkey .. " " .. definition.label .. " L" .. level, 321, y, maxed and Config.color.gold or affordable and Config.color.parchment or Config.color.panel_dark)
    gfx.text(maxed and "MAX" or compact_cost(cost), 389, y, maxed and Config.color.gold or affordable and Config.color.parchment or Config.color.panel_dark)
  end

  if state.status_timer > 0 then
    gfx.text(state.status_message, 8, 215, Config.color.white)
  end
end

function Rendering.draw_start()
  draw_backdrop(Config.day_length)
  draw_panel(72, 42, 336, 152)
  gfx.text_ex("Cozy Kingdom", 146, 62, 2, 0, Config.color.gold, 1)
  gfx.text("Raise a gentle realm before the fifth night.", 112, 90, Config.color.deep)
  gfx.text("Cursor: WASD / arrows or mouse hover", 108, 112, Config.color.deep)
  gfx.text("Click/tap or Space/Enter to place", 108, 124, Config.color.deep)
  gfx.text("Priority: Q/E or G/B/F", 108, 136, Config.color.deep)
  gfx.text("Build: 1 Hut  2 Farm  3 Tower", 108, 148, Config.color.deep)
  gfx.text("Upgrades: 4 Boots  5 Arrows  6 Seeds", 108, 160, Config.color.deep)
  gfx.text("Press Enter to Start", 174, 180, Config.color.white)
  draw_tree(160, 216, 1)
  draw_bush(314, 218, 1)
  draw_king({ position = { x = 240, y = 218 }, step_time = 0 })
end

function Rendering.draw_game(state)
  draw_backdrop(state.day_timer)

  for _, tile in ipairs(state.tiles) do
    draw_tile(tile)
  end

  draw_placement_ghost(state)

  for _, warning in ipairs(state.spawn_warnings) do
    draw_spawn_warning(warning)
  end
  for _, node in ipairs(state.nodes) do
    draw_resource_node(node)
  end
  for _, building in ipairs(state.buildings) do
    draw_building(building)
  end
  for _, villager in ipairs(state.villagers) do
    draw_villager(villager)
  end
  for _, hazard in ipairs(state.hazards) do
    draw_hazard(hazard)
  end

  draw_camp_flash(state)
  draw_king(state.king)
  draw_effects(state)
  draw_hud(state)
end

function Rendering.draw_game_over(result)
  gfx.rect_fill(86, 62, 308, 132, Config.color.deep)
  draw_panel(92, 68, 296, 120)
  gfx.text_ex(result.title, result.won and 154 or 164, 88, 2, 0, result.won and Config.color.gold or Config.color.danger, 1)
  gfx.text(result.reason, 112, 122, Config.color.white)
  gfx.text("Score " .. result.score, 206, 148, Config.color.gold)
  gfx.text("Press R to Restart", 186, 170, Config.color.white)
end

return Rendering
