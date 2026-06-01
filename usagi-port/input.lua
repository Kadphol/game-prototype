local Config = require "config"

local Controls = {}

local function key_pressed(key)
  return key ~= nil and input.key_pressed(key)
end

local function key_or_action_pressed(action, key_a, key_b)
  return input.pressed(action) or key_pressed(key_a) or key_pressed(key_b)
end

local function screen_to_tile(x, y)
  if x == nil or y == nil then
    return nil
  end
  if y >= Config.bottom_ui_y then
    return nil
  end

  local column = math.floor((x - Config.world_offset_x) / Config.tile_size)
  local row = math.floor((y - Config.world_offset_y) / Config.tile_size)
  if column <= 0 or row <= 0 or column >= Config.world_columns - 1 or row >= Config.world_rows - 1 then
    return nil
  end

  return { column = column, row = row }
end

function Controls.start_pressed()
  return key_pressed(input.KEY_ENTER) or key_pressed(input.KEY_SPACE) or input.pressed(input.BTN1)
end

function Controls.restart_pressed()
  return key_pressed(input.KEY_R)
end

function Controls.world_command()
  local dx = 0
  local dy = 0

  if key_or_action_pressed(input.LEFT, input.KEY_LEFT, input.KEY_A) then
    dx = dx - 1
  end
  if key_or_action_pressed(input.RIGHT, input.KEY_RIGHT, input.KEY_D) then
    dx = dx + 1
  end
  if key_or_action_pressed(input.UP, input.KEY_UP, input.KEY_W) then
    dy = dy - 1
  end
  if key_or_action_pressed(input.DOWN, input.KEY_DOWN, input.KEY_S) then
    dy = dy + 1
  end

  local mx, my = input.mouse()
  local mouse_tile = screen_to_tile(mx, my)
  local mouse_place = mouse_tile ~= nil and input.mouse_pressed(input.MOUSE_LEFT)

  local command = {
    cursor_delta = { x = dx, y = dy },
    cursor_tile = mouse_tile,
    place = mouse_place or key_pressed(input.KEY_ENTER) or key_pressed(input.KEY_SPACE) or input.pressed(input.BTN1),
    priority_cycle = 0,
  }

  if key_pressed(input.KEY_1) then
    command.selected_building = "hut"
  elseif key_pressed(input.KEY_2) then
    command.selected_building = "farm"
  elseif key_pressed(input.KEY_3) then
    command.selected_building = "tower"
  end

  if key_pressed(input.KEY_4) then
    command.upgrade_kind = "villager_speed"
  elseif key_pressed(input.KEY_5) then
    command.upgrade_kind = "tower_damage"
  elseif key_pressed(input.KEY_6) then
    command.upgrade_kind = "farm_yield"
  end

  if key_pressed(input.KEY_Q) then
    command.priority_cycle = -1
  elseif key_pressed(input.KEY_E) then
    command.priority_cycle = 1
  end

  if key_pressed(input.KEY_G) then
    command.selected_priority = "gather"
  elseif key_pressed(input.KEY_B) then
    command.selected_priority = "build"
  elseif key_pressed(input.KEY_F) then
    command.selected_priority = "defend"
  end

  return command
end

return Controls
