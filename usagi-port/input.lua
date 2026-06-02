local Config = require "config"
local UI = require "ui"

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
  local mx, my = input.mouse()
  local hit = input.mouse_pressed(input.MOUSE_LEFT) and UI.button_at(mx, my, "start")
  return key_pressed(input.KEY_ENTER) or key_pressed(input.KEY_SPACE) or input.pressed(input.BTN1) or hit ~= nil
end

function Controls.restart_pressed()
  local mx, my = input.mouse()
  local hit = input.mouse_pressed(input.MOUSE_LEFT) and UI.button_at(mx, my, "game_over")
  return key_pressed(input.KEY_R) or hit ~= nil
end

function Controls.world_command(state)
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
  local mouse_clicked = input.mouse_pressed(input.MOUSE_LEFT)
  local ui_button = mouse_clicked and UI.button_at(mx, my, "playing") or nil
  local over_ui = UI.is_over_playing_ui(mx, my)
  local mouse_tile = not over_ui and screen_to_tile(mx, my) or nil
  local mouse_place = mouse_tile ~= nil and mouse_clicked

  local command = {
    cursor_delta = { x = dx, y = dy },
    cursor_tile = mouse_tile,
    place = mouse_place or key_pressed(input.KEY_ENTER) or key_pressed(input.KEY_SPACE) or input.pressed(input.BTN1),
    priority_cycle = 0,
  }

  if ui_button then
    UI.apply_button_command(command, ui_button, state)
  end

  if key_pressed(input.KEY_1) then
    command.selected_building = "hut"
    command.source = "keyboard-build"
  elseif key_pressed(input.KEY_2) then
    command.selected_building = "farm"
    command.source = "keyboard-build"
  elseif key_pressed(input.KEY_3) then
    command.selected_building = "tower"
    command.source = "keyboard-build"
  end

  if key_pressed(input.KEY_4) then
    command.upgrade_purchase = { kind = "villager_speed" }
    command.source = "keyboard-upgrade"
  elseif key_pressed(input.KEY_5) then
    command.upgrade_purchase = { kind = "tower_damage" }
    command.source = "keyboard-upgrade"
  elseif key_pressed(input.KEY_6) then
    command.upgrade_purchase = { kind = "farm_yield" }
    command.source = "keyboard-upgrade"
  elseif key_pressed(input.KEY_7) or key_pressed(input.KEY_8) then
    local selected = state and state.selected_upgrade or Config.upgrade_order[1]
    local index = key_pressed(input.KEY_7) and 1 or 2
    local definition = Config.upgrades[selected]
    local branch = definition and definition.branches[index]
    if branch then
      command.upgrade_purchase = { kind = selected, branch = branch.kind }
      command.source = "keyboard-branch"
    end
  end

  if key_pressed(input.KEY_Q) then
    command.priority_cycle = -1
    command.source = "keyboard-priority"
  elseif key_pressed(input.KEY_E) then
    command.priority_cycle = 1
    command.source = "keyboard-priority"
  end

  if key_pressed(input.KEY_G) then
    command.selected_priority = "gather"
    command.source = "keyboard-priority"
  elseif key_pressed(input.KEY_B) then
    command.selected_priority = "build"
    command.source = "keyboard-priority"
  elseif key_pressed(input.KEY_F) then
    command.selected_priority = "defend"
    command.source = "keyboard-priority"
  end

  if key_pressed(input.KEY_F1)
      or key_pressed(input.KEY_GRAVE)
      or key_pressed(input.KEY_BACKTICK)
      or key_pressed(input.KEY_BACKQUOTE) then
    command.debug_toggle = true
    command.source = "keyboard-debug"
  end

  if mouse_place and command.source == nil then
    command.source = "pointer-world"
  elseif command.place and command.source == nil then
    command.source = "keyboard-place"
  end

  return command
end

return Controls
