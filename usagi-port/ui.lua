local Config = require "config"

local UI = {}

local function button(id, phase, x, y, w, h, action, value)
  return {
    id = id,
    phase = phase,
    x = x,
    y = y,
    w = w,
    h = h,
    action = action,
    value = value,
  }
end

UI.start = button("start", "start", 168, 174, 144, 18, "start")
UI.restart = button("restart", "game_over", 176, 166, 128, 18, "restart")

UI.playing_buttons = {
  button("build_hut", "playing", 6, Config.bottom_ui_y + 4, 48, 18, "selected_building", "hut"),
  button("build_farm", "playing", 58, Config.bottom_ui_y + 4, 48, 18, "selected_building", "farm"),
  button("build_tower", "playing", 110, Config.bottom_ui_y + 4, 48, 18, "selected_building", "tower"),

  button("priority_gather", "playing", 166, Config.bottom_ui_y + 4, 50, 18, "selected_priority", "gather"),
  button("priority_build", "playing", 220, Config.bottom_ui_y + 4, 50, 18, "selected_priority", "build"),
  button("priority_defend", "playing", 274, Config.bottom_ui_y + 4, 50, 18, "selected_priority", "defend"),

  button("place", "playing", 330, Config.bottom_ui_y + 4, 54, 18, "place"),
  button("debug", "playing", 390, Config.bottom_ui_y + 4, 38, 18, "debug_toggle"),

  button("upgrade_boots", "playing", 6, Config.bottom_ui_y + 27, 66, 26, "upgrade", "villager_speed"),
  button("upgrade_arrows", "playing", 76, Config.bottom_ui_y + 27, 68, 26, "upgrade", "tower_damage"),
  button("upgrade_seeds", "playing", 148, Config.bottom_ui_y + 27, 62, 26, "upgrade", "farm_yield"),

  button("branch_a", "playing", 216, Config.bottom_ui_y + 27, 96, 26, "upgrade_branch", 1),
  button("branch_b", "playing", 316, Config.bottom_ui_y + 27, 96, 26, "upgrade_branch", 2),
}

local function contains(rect, x, y)
  return x ~= nil and y ~= nil and x >= rect.x and y >= rect.y and x < rect.x + rect.w and y < rect.y + rect.h
end

function UI.button_at(x, y, phase)
  if phase == "start" and contains(UI.start, x, y) then
    return UI.start
  end
  if phase == "game_over" and contains(UI.restart, x, y) then
    return UI.restart
  end
  if phase == "playing" then
    for _, candidate in ipairs(UI.playing_buttons) do
      if contains(candidate, x, y) then
        return candidate
      end
    end
  end
  return nil
end

function UI.is_over_playing_ui(x, y)
  return UI.button_at(x, y, "playing") ~= nil or (y ~= nil and y >= Config.bottom_ui_y)
end

function UI.apply_button_command(command, button_hit, state)
  if not button_hit then
    return
  end

  command.source = "touch-" .. button_hit.id
  if button_hit.action == "selected_building" then
    command.selected_building = button_hit.value
  elseif button_hit.action == "selected_priority" then
    command.selected_priority = button_hit.value
  elseif button_hit.action == "place" then
    command.place = true
  elseif button_hit.action == "debug_toggle" then
    command.debug_toggle = true
  elseif button_hit.action == "upgrade" then
    command.upgrade_purchase = { kind = button_hit.value }
  elseif button_hit.action == "upgrade_branch" and state ~= nil then
    local selected = state.selected_upgrade or Config.upgrade_order[1]
    local definition = Config.upgrades[selected]
    local branch = definition and definition.branches[button_hit.value]
    if branch then
      command.upgrade_purchase = { kind = selected, branch = branch.kind }
    end
  end
end

function UI.button_count()
  return #UI.playing_buttons + 2
end

return UI
