local Config = require "config"

local World = {}

local CAMP_COLUMN = math.floor(Config.world_columns / 2)
local CAMP_ROW = math.floor(Config.world_rows / 2)

local function copy_stock(stock)
  return {
    wood = stock.wood or 0,
    stone = stock.stone or 0,
    food = stock.food or 0,
    gold = stock.gold or 0,
  }
end

local function clamp(value, min_value, max_value)
  return math.max(min_value, math.min(max_value, value))
end

local function distance(a, b)
  local dx = a.x - b.x
  local dy = a.y - b.y
  return math.sqrt(dx * dx + dy * dy)
end

local function normalize(x, y)
  local length = math.sqrt(x * x + y * y)
  if length == 0 then
    return 0, 0
  end
  return x / length, y / length
end

local function random_between(min_value, max_value)
  return min_value + math.random() * (max_value - min_value)
end

function World.tile_center(column, row)
  return {
    x = Config.world_offset_x + column * Config.tile_size + Config.tile_size / 2,
    y = Config.world_offset_y + row * Config.tile_size + Config.tile_size / 2,
  }
end

local function tile_index(column, row)
  return row * Config.world_columns + column + 1
end

local function create_tiles()
  local tiles = {}
  for row = 0, Config.world_rows - 1 do
    for column = 0, Config.world_columns - 1 do
      local terrain = "grass"
      if row == 0 or column == 0 or row == Config.world_rows - 1 or column == Config.world_columns - 1 then
        terrain = "forest"
      end
      if (column == 17 and row > 6) or (column == 18 and row > 5) then
        terrain = "water"
      end
      table.insert(tiles, { column = column, row = row, terrain = terrain })
    end
  end
  return tiles
end

local function create_resource_nodes()
  local placements = {
    { "wood", 2, 2, 18 },
    { "wood", 4, 3, 18 },
    { "wood", 3, 8, 18 },
    { "wood", 14, 2, 18 },
    { "wood", 16, 4, 18 },
    { "stone", 6, 2, 12 },
    { "stone", 13, 8, 12 },
    { "stone", 5, 9, 12 },
    { "food", 8, 3, 14 },
    { "food", 11, 9, 14 },
    { "food", 15, 7, 14 },
  }

  local nodes = {}
  for index, placement in ipairs(placements) do
    table.insert(nodes, {
      id = index + 100,
      kind = placement[1],
      column = placement[2],
      row = placement[3],
      amount = placement[4],
      max_amount = placement[4],
      respawn_timer = 0,
    })
  end
  return nodes
end

local function create_villager(id, position)
  return {
    id = id,
    position = { x = position.x, y = position.y },
    target = { x = position.x, y = position.y },
    task = { kind = "idle" },
    carried = nil,
    carried_amount = 0,
    speed = Config.villager_speed + (id % 3) * 2,
    work_timer = 0,
    pause_timer = random_between(0.2, 0.9),
    step_time = random_between(0, math.pi * 2),
  }
end

local function can_afford(resources, cost)
  return resources.wood >= cost.wood
    and resources.stone >= cost.stone
    and resources.food >= cost.food
    and resources.gold >= cost.gold
end

local function spend(resources, cost)
  resources.wood = resources.wood - cost.wood
  resources.stone = resources.stone - cost.stone
  resources.food = resources.food - cost.food
  resources.gold = resources.gold - cost.gold
end

local function format_cost(cost)
  local parts = {}
  if cost.wood > 0 then table.insert(parts, cost.wood .. " wood") end
  if cost.stone > 0 then table.insert(parts, cost.stone .. " stone") end
  if cost.food > 0 then table.insert(parts, cost.food .. " food") end
  if cost.gold > 0 then table.insert(parts, cost.gold .. " gold") end
  return table.concat(parts, ", ")
end

local function resource_color(kind)
  if kind == "wood" then return Config.color.wood end
  if kind == "stone" then return Config.color.stone end
  if kind == "food" then return Config.color.berry end
  return Config.color.gold
end

local function gather_amount_for(kind)
  if kind == "wood" then return 5 end
  if kind == "stone" then return 3 end
  return 4
end

local function respawn_time_for(kind)
  if kind == "wood" then return 15 end
  if kind == "stone" then return 21 end
  return 12
end

local function offset_target(position, seed)
  local angle = seed * 1.919
  return {
    x = position.x + math.cos(angle) * 5,
    y = position.y + math.sin(angle) * 4,
  }
end

local function nearest_node(position, nodes)
  local nearest = nil
  local nearest_distance = math.huge
  for _, node in ipairs(nodes) do
    local node_distance = distance(position, World.tile_center(node.column, node.row))
    if node_distance < nearest_distance then
      nearest = node
      nearest_distance = node_distance
    end
  end
  return nearest
end

local function nearest_building(position, buildings, kind, complete)
  local nearest = nil
  local nearest_distance = math.huge
  for _, building in ipairs(buildings) do
    if (kind == nil or building.kind == kind) and (complete == nil or building.complete == complete) then
      local building_distance = distance(position, World.tile_center(building.column, building.row))
      if building_distance < nearest_distance then
        nearest = building
        nearest_distance = building_distance
      end
    end
  end
  return nearest
end

local function nearest_hazard(position, hazards)
  local nearest = nil
  local nearest_distance = math.huge
  for _, hazard in ipairs(hazards) do
    if hazard.state == "raiding" then
      local hazard_distance = distance(position, hazard.position)
      if hazard_distance < nearest_distance then
        nearest = hazard
        nearest_distance = hazard_distance
      end
    end
  end
  return nearest
end

local function nearest_hazard_in_range(position, hazards, range)
  local nearest = nil
  local nearest_distance = range
  for _, hazard in ipairs(hazards) do
    if hazard.state == "raiding" then
      local hazard_distance = distance(position, hazard.position)
      if hazard_distance < nearest_distance then
        nearest = hazard
        nearest_distance = hazard_distance
      end
    end
  end
  return nearest
end

local function count_complete_buildings(state, kind)
  local count = 0
  for _, building in ipairs(state.buildings) do
    if building.complete and building.kind == kind then
      count = count + 1
    end
  end
  return count
end

local function set_status(state, message, timer)
  state.status_message = message
  state.status_timer = timer
end

local function add_floating_text(state, text, position, color)
  table.insert(state.floating_texts, {
    id = state.next_id,
    text = text,
    position = { x = position.x, y = position.y },
    color = color,
    life = 1.25,
    max_life = 1.25,
  })
  state.next_id = state.next_id + 1
  if #state.floating_texts > 28 then
    table.remove(state.floating_texts, 1)
  end
end

local function add_attack_effect(state, from, to, color)
  table.insert(state.attack_effects, {
    id = state.next_id,
    from = { x = from.x, y = from.y },
    to = { x = to.x, y = to.y },
    color = color,
    life = 0.18,
    max_life = 0.18,
  })
  state.next_id = state.next_id + 1
  if #state.attack_effects > 32 then
    table.remove(state.attack_effects, 1)
  end
end

local function spawn_sparkles(state, position, color, count)
  for _ = 1, count do
    local angle = random_between(0, math.pi * 2)
    local speed = random_between(7, 25)
    table.insert(state.particles, {
      id = state.next_id,
      position = { x = position.x, y = position.y },
      velocity = { x = math.cos(angle) * speed, y = math.sin(angle) * speed },
      color = color,
      life = random_between(0.25, 0.68),
      max_life = 0.68,
    })
    state.next_id = state.next_id + 1
  end

  while #state.particles > 90 do
    table.remove(state.particles, 1)
  end
end

local function fail_at_cursor(state, message)
  local position = World.tile_center(state.cursor.column, state.cursor.row)
  add_floating_text(state, message, position, Config.color.danger)
  spawn_sparkles(state, position, Config.color.danger, 4)
  set_status(state, message, 1.8)
end

local function tile_at_cursor(state)
  return state.tiles[tile_index(state.cursor.column, state.cursor.row)]
end

local function node_on_tile(state, column, row)
  for _, node in ipairs(state.nodes) do
    if node.column == column and node.row == row and node.amount > 0 then
      return true
    end
  end
  return false
end

local function is_buildable_tile(state, tile)
  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)
  local center = World.tile_center(tile.column, tile.row)
  local near_camp = distance(center, camp) < 116
  return tile.terrain == "grass" and tile.building_id == nil and not node_on_tile(state, tile.column, tile.row) and near_camp
end

function World.can_place_hovered(state)
  local tile = tile_at_cursor(state)
  if not tile then return false end
  return is_buildable_tile(state, tile) and can_afford(state.resources, Config.buildings[state.selected_building].cost)
end

local function set_priority(state, priority)
  if state.priority == priority then
    return
  end

  state.priority = priority
  for _, villager in ipairs(state.villagers) do
    if villager.task.kind == "idle" or villager.pause_timer > 0.2 then
      villager.pause_timer = 0
      villager.task = { kind = "idle" }
    end
  end
  set_status(state, "Priority: " .. string.upper(priority), 2.1)
end

local function update_selection(state, command)
  if command.selected_building then
    state.selected_building = command.selected_building
    local definition = Config.buildings[command.selected_building]
    set_status(state, definition.hotkey .. ": " .. definition.label .. " selected - " .. definition.description, 2.4)
  end

  if command.selected_priority then
    set_priority(state, command.selected_priority)
  elseif command.priority_cycle ~= nil and command.priority_cycle ~= 0 then
    local current = 1
    for index, priority in ipairs(Config.priority_order) do
      if priority == state.priority then
        current = index
      end
    end
    local next_index = ((current - 1 + command.priority_cycle) % #Config.priority_order) + 1
    set_priority(state, Config.priority_order[next_index])
  end
end

local function update_cursor(state, dt, command)
  state.cursor.pulse = state.cursor.pulse + dt * 5

  if command.cursor_tile then
    state.cursor.column = clamp(command.cursor_tile.column, 1, Config.world_columns - 2)
    state.cursor.row = clamp(command.cursor_tile.row, 1, Config.world_rows - 2)
  end

  local dx = command.cursor_delta and command.cursor_delta.x or 0
  local dy = command.cursor_delta and command.cursor_delta.y or 0
  if dx ~= 0 or dy ~= 0 then
    state.cursor.column = clamp(state.cursor.column + (dx > 0 and 1 or dx < 0 and -1 or 0), 1, Config.world_columns - 2)
    state.cursor.row = clamp(state.cursor.row + (dy > 0 and 1 or dy < 0 and -1 or 0), 1, Config.world_rows - 2)
  end
end

local function try_place_building(state)
  local tile = tile_at_cursor(state)
  local kind = state.selected_building
  if not tile or not is_buildable_tile(state, tile) then
    fail_at_cursor(state, "Cannot build here")
    return
  end

  local definition = Config.buildings[kind]
  if not can_afford(state.resources, definition.cost) then
    fail_at_cursor(state, "Need " .. format_cost(definition.cost))
    return
  end

  spend(state.resources, definition.cost)
  local building = {
    id = state.next_id,
    kind = kind,
    column = tile.column,
    row = tile.row,
    age = 0,
    pulse = 1,
    complete = false,
    build_progress = 0,
    build_time = definition.build_time,
    production_timer = kind == "farm" and 5 or 0,
    attack_cooldown = 0,
  }
  state.next_id = state.next_id + 1
  tile.building_id = building.id
  table.insert(state.buildings, building)

  local center = World.tile_center(tile.column, tile.row)
  add_floating_text(state, "planned", center, Config.color.gold)
  spawn_sparkles(state, center, Config.color.gold, 6)
  set_status(state, definition.label .. " planned. Builders will finish it.", 2.2)
end

local function try_purchase_upgrade(state, purchase)
  local kind = purchase.kind
  local definition = Config.upgrades[kind]
  if not definition then
    return
  end

  local track = state.upgrades[kind]
  state.selected_upgrade = kind

  if purchase.branch == nil then
    if track.base_purchased then
      set_status(state, definition.base_label .. " learned. Pick a " .. definition.label .. " branch.", 2.4)
      return
    end

    if not can_afford(state.resources, definition.base_cost) then
      fail_at_cursor(state, "Need " .. format_cost(definition.base_cost))
      return
    end

    spend(state.resources, definition.base_cost)
    track.base_purchased = true
    local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)
    add_floating_text(state, definition.base_label, camp, Config.color.gold)
    spawn_sparkles(state, camp, Config.color.gold, 12)
    set_status(state, definition.base_label .. ": " .. definition.base_description, 2.4)
    if effect and effect.flash then
      effect.flash(0.08, Config.color.gold)
    end
    return
  end

  local branch = nil
  for _, candidate in ipairs(definition.branches) do
    if candidate.kind == purchase.branch then
      branch = candidate
      break
    end
  end

  if not branch then
    return
  end

  if not track.base_purchased then
    fail_at_cursor(state, "Unlock " .. definition.base_label .. " first")
    return
  end

  if track.branch ~= nil then
    set_status(state, "Branch already chosen. Alternate branch locked.", 2.4)
    return
  end

  if not can_afford(state.resources, branch.cost) then
    fail_at_cursor(state, "Need " .. format_cost(branch.cost))
    return
  end

  spend(state.resources, branch.cost)
  track.branch = branch.kind
  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)
  add_floating_text(state, branch.label, camp, Config.color.gold)
  spawn_sparkles(state, camp, Config.color.gold, 14)
  set_status(state, branch.label .. ": " .. branch.description, 2.8)
  if effect and effect.flash then
    effect.flash(0.08, Config.color.gold)
  end
end

local function ensure_villager_count(state)
  local target = math.min(state.population, Config.max_visible_villagers)
  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)
  while #state.villagers < target do
    local index = #state.villagers + 1
    local villager = create_villager(state.next_id, {
      x = camp.x + (index - 3) * 5,
      y = camp.y + 16 + (index % 2) * 3,
    })
    state.next_id = state.next_id + 1
    table.insert(state.villagers, villager)
    add_floating_text(state, "new villager", villager.position, Config.color.parchment)
  end
end

local function unfinished_buildings(state)
  local buildings = {}
  for _, building in ipairs(state.buildings) do
    if not building.complete then
      table.insert(buildings, building)
    end
  end
  return buildings
end

local function active_hazards(state)
  local hazards = {}
  for _, hazard in ipairs(state.hazards) do
    if hazard.state == "raiding" then
      table.insert(hazards, hazard)
    end
  end
  return hazards
end

local function has_complete_tower(state)
  return count_complete_buildings(state, "tower") > 0
end

local function lowest_resource_kind(state)
  local kind = "wood"
  local value = state.resources.wood
  if state.resources.stone * 1.3 < value then
    kind = "stone"
    value = state.resources.stone * 1.3
  end
  if state.resources.food < value then
    kind = "food"
  end
  return kind
end

local function has_upgrade_base(state, kind)
  return state.upgrades[kind] ~= nil and state.upgrades[kind].base_purchased == true
end

local function has_upgrade_branch(state, branch)
  for _, track in pairs(state.upgrades) do
    if track.branch == branch then
      return true
    end
  end
  return false
end

local function villager_speed_multiplier(state)
  local multiplier = has_upgrade_base(state, "villager_speed") and 1.16 or 1
  if has_upgrade_branch(state, "trail_runners") then multiplier = multiplier + 0.18 end
  if has_upgrade_branch(state, "pack_guild") then multiplier = multiplier + 0.08 end
  return multiplier
end

local function gather_carry_bonus(state)
  return has_upgrade_branch(state, "pack_guild") and 1 or 0
end

local function villager_pause(state, base)
  return has_upgrade_branch(state, "trail_runners") and base * 0.74 or base
end

local function tower_damage_multiplier(state)
  local multiplier = has_upgrade_base(state, "tower_damage") and 1.32 or 1
  if has_upgrade_branch(state, "longbows") then multiplier = multiplier + 0.2 end
  if has_upgrade_branch(state, "ballistae") then multiplier = multiplier + 0.55 end
  return multiplier
end

local function tower_range(state)
  return has_upgrade_branch(state, "longbows") and Config.tower_range * 1.25 or Config.tower_range
end

local function farm_food_yield(state)
  local amount = 5
  if has_upgrade_base(state, "farm_yield") then amount = amount + 2 end
  if has_upgrade_branch(state, "orchards") then amount = amount + 4 end
  if has_upgrade_branch(state, "granaries") then amount = amount + 2 end
  return amount
end

local function farm_gold_yield(state)
  return has_upgrade_branch(state, "granaries") and 2 or 0
end

local function pick_gather_node(state, position)
  local available = {}
  local preferred = {}
  local preferred_kind = lowest_resource_kind(state)

  for _, node in ipairs(state.nodes) do
    if node.amount > 0 then
      table.insert(available, node)
      if node.kind == preferred_kind then
        table.insert(preferred, node)
      end
    end
  end

  if #available == 0 then
    return nil
  end
  return nearest_node(position, #preferred > 0 and preferred or available)
end

local function choose_task(state, villager)
  local unfinished = unfinished_buildings(state)
  local hazards = active_hazards(state)

  if state.priority == "build" and #unfinished > 0 and villager.id % 4 ~= 0 then
    local building = nearest_building(villager.position, unfinished)
    return { kind = "build", target_building_id = building and building.id or nil }
  end

  if state.priority == "defend" and (#hazards > 0 or has_complete_tower(state)) and villager.id % 4 ~= 1 then
    local hazard = nearest_hazard(villager.position, hazards)
    return { kind = "defend", target_hazard_id = hazard and hazard.id or nil }
  end

  if state.priority == "gather" or villager.id % 3 ~= 0 then
    local node = pick_gather_node(state, villager.position)
    if node then
      return { kind = "gather", target_node_id = node.id, phase = "to_target" }
    end
  end

  if #unfinished > 0 then
    local building = nearest_building(villager.position, unfinished)
    return { kind = "build", target_building_id = building and building.id or nil }
  end

  if #hazards > 0 or has_complete_tower(state) then
    local hazard = nearest_hazard(villager.position, hazards)
    return { kind = "defend", target_hazard_id = hazard and hazard.id or nil }
  end

  return { kind = "idle" }
end

local function target_for_task(state, task, villager)
  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)

  if task.kind == "gather" and task.target_node_id then
    for _, node in ipairs(state.nodes) do
      if node.id == task.target_node_id and node.amount > 0 then
        return offset_target(World.tile_center(node.column, node.row), villager.id)
      end
    end
  elseif task.kind == "build" and task.target_building_id then
    for _, building in ipairs(state.buildings) do
      if building.id == task.target_building_id and not building.complete then
        return offset_target(World.tile_center(building.column, building.row), villager.id)
      end
    end
  elseif task.kind == "defend" then
    for _, hazard in ipairs(state.hazards) do
      if hazard.id == task.target_hazard_id and hazard.state == "raiding" then
        return { x = hazard.position.x, y = hazard.position.y }
      end
    end

    local tower = nearest_building(villager.position, state.buildings, "tower", true)
    if tower then
      return offset_target(World.tile_center(tower.column, tower.row), villager.id)
    end
  end

  return offset_target(camp, villager.id)
end

local function move_villager_toward(state, villager, target, dt)
  local nx, ny = normalize(target.x - villager.position.x, target.y - villager.position.y)
  local speed_multiplier = villager_speed_multiplier(state)
  local speed = (villager.task.kind == "defend" and Config.defender_speed or villager.speed) * speed_multiplier
  villager.position.x = villager.position.x + nx * speed * dt
  villager.position.y = villager.position.y + ny * speed * dt
end

local function complete_building(state, building)
  local definition = Config.buildings[building.kind]
  building.complete = true
  building.build_progress = building.build_time
  building.pulse = 1.1
  state.prosperity = state.prosperity + definition.prosperity

  if building.kind == "hut" then
    state.population = state.population + 1
    state.morale = math.min(100, state.morale + 5)
  end

  local center = World.tile_center(building.column, building.row)
  add_floating_text(state, "+" .. definition.prosperity .. " prosperity", center, Config.color.gold)
  spawn_sparkles(state, center, Config.color.gold, 12)
  set_status(state, definition.label .. " completed!", 2.1)
end

local function damage_hazard(state, hazard, amount, from, color)
  hazard.health = hazard.health - amount
  hazard.hit_flash = 0.16
  add_attack_effect(state, from, hazard.position, color)
  spawn_sparkles(state, hazard.position, color, 3)
end

local function resolve_villager_arrival(state, villager)
  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)

  if villager.task.kind == "gather" then
    if villager.task.phase == "to_camp" and villager.carried then
      state.resources[villager.carried] = state.resources[villager.carried] + villager.carried_amount
      add_floating_text(state, "+" .. villager.carried_amount .. " " .. villager.carried, villager.position, resource_color(villager.carried))
      spawn_sparkles(state, villager.position, resource_color(villager.carried), 4)
      villager.carried = nil
      villager.carried_amount = 0
      villager.task = { kind = "idle" }
      villager.pause_timer = villager_pause(state, 0.45)
      return
    end

    local node = nil
    for _, candidate in ipairs(state.nodes) do
      if candidate.id == villager.task.target_node_id and candidate.amount > 0 then
        node = candidate
        break
      end
    end

    if not node then
      villager.task = { kind = "idle" }
      return
    end

    local gathered = math.min(node.amount, gather_amount_for(node.kind) + gather_carry_bonus(state))
    node.amount = node.amount - gathered
    villager.carried = node.kind
    villager.carried_amount = gathered
    villager.task.phase = "to_camp"
    villager.target = offset_target(camp, villager.id)
    local node_center = World.tile_center(node.column, node.row)
    add_floating_text(state, "+" .. gathered, node_center, resource_color(node.kind))
    spawn_sparkles(state, node_center, resource_color(node.kind), 3)
    if node.amount <= 0 then
      node.respawn_timer = respawn_time_for(node.kind)
    end
    return
  end

  if villager.task.kind == "build" then
    local building = nil
    for _, candidate in ipairs(state.buildings) do
      if candidate.id == villager.task.target_building_id and not candidate.complete then
        building = candidate
        break
      end
    end

    if not building then
      villager.task = { kind = "idle" }
      return
    end

    building.build_progress = building.build_progress + 0.52
    building.pulse = math.max(building.pulse, 0.35)
    villager.pause_timer = villager_pause(state, 0.28)
    spawn_sparkles(state, World.tile_center(building.column, building.row), Config.color.parchment, 1)
    if building.build_progress >= building.build_time then
      complete_building(state, building)
      villager.task = { kind = "idle" }
    end
    return
  end

  if villager.task.kind == "defend" then
    local hazard = nil
    for _, candidate in ipairs(state.hazards) do
      if candidate.id == villager.task.target_hazard_id and candidate.state == "raiding" then
        hazard = candidate
        break
      end
    end

    if hazard and distance(villager.position, hazard.position) < 13 and villager.work_timer <= 0 then
      villager.work_timer = 0.55
      damage_hazard(state, hazard, 9, villager.position, Config.color.blue)
      villager.pause_timer = villager_pause(state, 0.16)
      return
    end

    villager.target = target_for_task(state, villager.task, villager)
    villager.task = state.priority == "defend" and villager.task or { kind = "idle" }
    villager.pause_timer = villager_pause(state, 0.35)
    return
  end

  villager.target = offset_target(camp, villager.id)
  villager.pause_timer = villager_pause(state, 0.65)
end

local function update_villagers(state, dt)
  for _, villager in ipairs(state.villagers) do
    villager.step_time = villager.step_time + dt * 8
    villager.pause_timer = math.max(0, villager.pause_timer - dt)
    villager.work_timer = math.max(0, villager.work_timer - dt)

    if villager.task.kind == "idle" and villager.pause_timer <= 0 then
      villager.task = choose_task(state, villager)
      villager.target = target_for_task(state, villager.task, villager)
    end

    if villager.pause_timer <= 0 then
      move_villager_toward(state, villager, villager.target, dt)
      if distance(villager.position, villager.target) < 5 then
        resolve_villager_arrival(state, villager)
      end
    end
  end
end

local function update_buildings(state, dt)
  for _, building in ipairs(state.buildings) do
    building.age = building.age + dt
    building.pulse = math.max(0, building.pulse - dt * 2.8)
    building.attack_cooldown = math.max(0, building.attack_cooldown - dt)

    if building.complete and building.kind == "farm" then
      building.production_timer = building.production_timer - dt
      if building.production_timer <= 0 then
        building.production_timer = 6.5
        local food_yield = farm_food_yield(state)
        local gold_yield = farm_gold_yield(state)
        state.resources.food = state.resources.food + food_yield
        if gold_yield > 0 then
          state.resources.gold = state.resources.gold + gold_yield
        end
        local center = World.tile_center(building.column, building.row)
        if gold_yield > 0 then
          add_floating_text(state, "+" .. food_yield .. " food +" .. gold_yield .. " gold", center, Config.color.berry)
        else
          add_floating_text(state, "+" .. food_yield .. " food", center, Config.color.berry)
        end
        spawn_sparkles(state, center, Config.color.berry, 4)
      end
    end
  end
end

local function random_edge_position()
  local side = math.floor(math.random() * 4)
  local min_x = Config.world_offset_x
  local max_x = Config.world_offset_x + Config.world_columns * Config.tile_size
  local min_y = Config.world_offset_y
  local max_y = Config.world_offset_y + Config.world_rows * Config.tile_size

  if side == 0 then return { x = min_x - 12, y = random_between(min_y + 8, max_y - 8) } end
  if side == 1 then return { x = max_x + 12, y = random_between(min_y + 8, max_y - 8) } end
  if side == 2 then return { x = random_between(min_x + 8, max_x - 8), y = min_y - 12 } end
  return { x = random_between(min_x + 8, max_x - 8), y = max_y + 12 }
end

local function create_spawn_warning(state)
  table.insert(state.spawn_warnings, {
    id = state.next_id,
    position = random_edge_position(),
    timer = 2.9,
    max_timer = 2.9,
  })
  state.next_id = state.next_id + 1
  set_status(state, "Enemy warning at the border.", 1.8)
end

local function spawn_hazard(state, position)
  local health = 42 + state.day * 7
  table.insert(state.hazards, {
    id = state.next_id,
    position = { x = position.x, y = position.y },
    speed = 18 + state.day * 1.7,
    health = health,
    max_health = health,
    state = "raiding",
    attack_cooldown = 0,
    hit_flash = 0,
  })
  state.next_id = state.next_id + 1
  set_status(state, "Raiders are moving toward camp.", 2.2)
end

local function update_spawn_warnings(state, dt)
  for index = #state.spawn_warnings, 1, -1 do
    local warning = state.spawn_warnings[index]
    warning.timer = warning.timer - dt
    if warning.timer <= 0 then
      spawn_hazard(state, warning.position)
      table.remove(state.spawn_warnings, index)
    end
  end
end

local function update_tower_attacks(state, dt)
  local damage_boost = (state.priority == "defend" and 1.35 or 1) * tower_damage_multiplier(state)
  local range = tower_range(state)
  for _, tower in ipairs(state.buildings) do
    if tower.complete and tower.kind == "tower" then
      local tower_center = World.tile_center(tower.column, tower.row)
      local target = nearest_hazard_in_range(tower_center, state.hazards, range)
      if target then
        target.health = target.health - Config.tower_damage_per_second * damage_boost * dt
        target.hit_flash = 0.16
        if tower.attack_cooldown <= 0 then
          tower.attack_cooldown = 0.22
          add_attack_effect(state, tower_center, target.position, Config.color.gold)
          spawn_sparkles(state, target.position, Config.color.gold, 3)
        end
      end
    end
  end
end

local function defeat_hazard(state, hazard)
  state.resources.gold = state.resources.gold + 3
  add_floating_text(state, "+3 gold", hazard.position, Config.color.gold)
  spawn_sparkles(state, hazard.position, Config.color.gold, 14)
  if effect and effect.screen_shake then
    effect.screen_shake(0.12, 2)
  end
end

local function update_hazards(state, dt)
  state.hazard_spawn_timer = state.hazard_spawn_timer - dt
  local is_night = state.day_timer < Config.day_length * 0.35
  if is_night and state.hazard_spawn_timer <= 0 then
    create_spawn_warning(state)
    state.hazard_spawn_timer = math.max(5.8, 10.5 - state.day * 0.9)
  end

  update_spawn_warnings(state, dt)
  update_tower_attacks(state, dt)

  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)
  for _, hazard in ipairs(state.hazards) do
    hazard.attack_cooldown = math.max(0, hazard.attack_cooldown - dt)
    hazard.hit_flash = math.max(0, hazard.hit_flash - dt)

    local target = camp
    if hazard.state == "fleeing" then
      target = {
        x = hazard.position.x + (hazard.position.x - camp.x),
        y = hazard.position.y + (hazard.position.y - camp.y),
      }
    end
    local nx, ny = normalize(target.x - hazard.position.x, target.y - hazard.position.y)
    hazard.position.x = hazard.position.x + nx * hazard.speed * dt
    hazard.position.y = hazard.position.y + ny * hazard.speed * dt

    if hazard.state == "raiding" and distance(hazard.position, camp) < 12 and hazard.attack_cooldown <= 0 then
      hazard.attack_cooldown = 2.8
      hazard.state = "fleeing"
      hazard.health = hazard.health - 8
      state.morale = math.max(0, state.morale - 13)
      state.resources.food = math.max(0, state.resources.food - 3)
      state.camp_flash = 0.42
      add_floating_text(state, "-13 morale", camp, Config.color.danger)
      spawn_sparkles(state, camp, Config.color.danger, 14)
      set_status(state, "Raiders hit the camp. Defend priority helps towers.", 2.8)
      if effect and effect.screen_shake then
        effect.screen_shake(0.3, 4)
      end
      if effect and effect.flash then
        effect.flash(0.08, Config.color.danger)
      end
    end
  end

  local min_x = Config.world_offset_x - 48
  local max_x = Config.world_offset_x + Config.world_columns * Config.tile_size + 48
  local min_y = Config.world_offset_y - 48
  local max_y = Config.world_offset_y + Config.world_rows * Config.tile_size + 48
  for index = #state.hazards, 1, -1 do
    local hazard = state.hazards[index]
    local outside = hazard.position.x < min_x or hazard.position.x > max_x or hazard.position.y < min_y or hazard.position.y > max_y
    if hazard.health <= 0 then
      defeat_hazard(state, hazard)
      table.remove(state.hazards, index)
    elseif hazard.state == "fleeing" and outside then
      table.remove(state.hazards, index)
    end
  end
end

local function update_resource_respawns(state, dt)
  for _, node in ipairs(state.nodes) do
    if node.amount <= 0 then
      node.respawn_timer = node.respawn_timer - dt
      if node.respawn_timer <= 0 then
        node.amount = node.max_amount
        local center = World.tile_center(node.column, node.row)
        add_floating_text(state, "regrown", center, resource_color(node.kind))
        spawn_sparkles(state, center, resource_color(node.kind), 5)
      end
    end
  end
end

local function end_game(state, won, reason)
  state.result = {
    won = won,
    title = won and "Kingdom Restored" or "Kingdom Faded",
    reason = reason,
    score = math.max(0, math.floor(state.prosperity * 12 + state.population * 8 + state.morale + 0.5)),
  }
end

local function update_day(state, dt)
  state.day_timer = state.day_timer - dt
  if state.day_timer > 0 then
    return
  end

  if state.day >= Config.max_days then
    end_game(state, false, "The final night passed before the kingdom was restored.")
    return
  end

  state.day = state.day + 1
  state.day_timer = Config.day_length
  state.hazard_spawn_timer = Config.day_length * 0.58

  local huts = count_complete_buildings(state, "hut")
  local dawn_gold = 4 + huts * 2
  local food_cost = math.max(1, state.population)
  state.resources.gold = state.resources.gold + dawn_gold
  state.resources.food = math.max(0, state.resources.food - food_cost)

  if state.resources.food <= 0 then
    state.morale = math.max(0, state.morale - 12)
    state.camp_flash = 0.25
    set_status(state, "Day " .. state.day .. ": food ran short, morale dropped.", 2.8)
  else
    state.morale = math.min(100, state.morale + 5)
    set_status(state, "Day " .. state.day .. ": dawn taxes +" .. dawn_gold .. " gold.", 2.8)
  end
end

local function update_effects(state, dt)
  state.status_timer = math.max(0, state.status_timer - dt)
  state.camp_flash = math.max(0, state.camp_flash - dt)

  for index = #state.floating_texts, 1, -1 do
    local text = state.floating_texts[index]
    text.position.y = text.position.y - dt * 11
    text.life = text.life - dt
    if text.life <= 0 then
      table.remove(state.floating_texts, index)
    end
  end

  for index = #state.particles, 1, -1 do
    local particle = state.particles[index]
    particle.position.x = particle.position.x + particle.velocity.x * dt
    particle.position.y = particle.position.y + particle.velocity.y * dt
    particle.life = particle.life - dt
    if particle.life <= 0 then
      table.remove(state.particles, index)
    end
  end

  for index = #state.attack_effects, 1, -1 do
    local attack = state.attack_effects[index]
    attack.life = attack.life - dt
    if attack.life <= 0 then
      table.remove(state.attack_effects, index)
    end
  end
end

local function check_end_conditions(state)
  if state.result then return end
  if state.prosperity >= Config.win_prosperity then
    end_game(state, true, "The camp has grown into a gentle little kingdom.")
  elseif state.morale <= 0 then
    end_game(state, false, "Morale collapsed after too many hard nights.")
  end
end

local function refresh_counts(state)
  local jobs = {
    idle = 0,
    gather = 0,
    build = 0,
    defend = 0,
    carrying = 0,
  }
  for _, villager in ipairs(state.villagers) do
    jobs[villager.task.kind] = jobs[villager.task.kind] + 1
    if villager.carried then
      jobs.carrying = jobs.carrying + 1
    end
  end
  state.job_counts = jobs

  local constructions = 0
  local progress = 0
  for _, building in ipairs(state.buildings) do
    if not building.complete then
      constructions = constructions + 1
      progress = progress + math.min(1, building.build_progress / building.build_time)
    end
  end

  local hazards = 0
  for _, hazard in ipairs(state.hazards) do
    if hazard.state == "raiding" then
      hazards = hazards + 1
    end
  end

  state.queue_preview = {
    constructions = constructions,
    construction_progress = constructions > 0 and progress / constructions or 1,
    hazards = hazards,
    warnings = #state.spawn_warnings,
    next_resource = lowest_resource_kind(state),
  }

  state.debug_counts = {
    villagers = #state.villagers,
    buildings = #state.buildings,
    hazards = #state.hazards,
    particles = #state.particles,
    floating_texts = #state.floating_texts,
    attack_effects = #state.attack_effects,
    spawn_warnings = #state.spawn_warnings,
  }
end

function World.new()
  local tiles = create_tiles()
  local camp_tile = tiles[tile_index(CAMP_COLUMN, CAMP_ROW)]
  local camp_id = 1
  camp_tile.building_id = camp_id

  local camp = World.tile_center(CAMP_COLUMN, CAMP_ROW)
  local villagers = {}
  for index = 1, 4 do
    table.insert(villagers, create_villager(index + 1, {
      x = camp.x + (index - 2.5) * 5,
      y = camp.y + 14 + (index % 2) * 3,
    }))
  end

  local state = {
    resources = copy_stock(Config.starting_resources),
    morale = Config.starting_morale,
    population = 4,
    prosperity = 10,
    day = 1,
    day_timer = Config.day_length,
    priority = "gather",
    selected_building = "hut",
    selected_upgrade = "villager_speed",
    upgrades = {
      villager_speed = { base_purchased = false, branch = nil },
      tower_damage = { base_purchased = false, branch = nil },
      farm_yield = { base_purchased = false, branch = nil },
    },
    job_counts = { idle = 4, gather = 0, build = 0, defend = 0, carrying = 0 },
    queue_preview = { constructions = 0, construction_progress = 1, hazards = 0, warnings = 0, next_resource = "wood" },
    debug_counts = { villagers = 4, buildings = 1, hazards = 0, particles = 0, floating_texts = 0, attack_effects = 0, spawn_warnings = 0 },
    debug_visible = false,
    last_command_source = "none",
    performance = { fps = 0, frame_ms = 0 },
    status_message = "Villagers work automatically. Set priority and place buildings.",
    status_timer = 4.5,
    king = {
      position = { x = camp.x + 2, y = camp.y + 12 },
      step_time = 0,
    },
    cursor = {
      column = CAMP_COLUMN + 1,
      row = CAMP_ROW,
      pulse = 0,
    },
    tiles = tiles,
    nodes = create_resource_nodes(),
    buildings = {
      {
        id = camp_id,
        kind = "hut",
        column = CAMP_COLUMN,
        row = CAMP_ROW,
        age = 0,
        pulse = 0,
        complete = true,
        build_progress = Config.buildings.hut.build_time,
        build_time = Config.buildings.hut.build_time,
        production_timer = 0,
        attack_cooldown = 0,
      },
    },
    villagers = villagers,
    hazards = {},
    spawn_warnings = {},
    attack_effects = {},
    floating_texts = {},
    particles = {},
    next_id = 20,
    hazard_spawn_timer = Config.day_length * 0.62,
    camp_flash = 0,
    result = nil,
  }
  refresh_counts(state)
  return state
end

function World.update(state, dt, command)
  if state.result then
    refresh_counts(state)
    return
  end

  if command.source then
    state.last_command_source = command.source
  end

  if command.debug_toggle then
    state.debug_visible = not state.debug_visible
  end

  update_selection(state, command)
  update_cursor(state, dt, command)

  if command.upgrade_purchase then
    try_purchase_upgrade(state, command.upgrade_purchase)
  end

  if command.place then
    try_place_building(state)
  end

  ensure_villager_count(state)
  update_villagers(state, dt)
  update_buildings(state, dt)
  update_hazards(state, dt)
  update_resource_respawns(state, dt)
  update_day(state, dt)
  update_effects(state, dt)
  refresh_counts(state)
  check_end_conditions(state)
end

return World
