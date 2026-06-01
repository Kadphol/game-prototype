local Config = require "config"
local Controls = require "input"
local Rendering = require "rendering"
local World = require "world"

function _config()
  return {
    name = "Cozy Kingdom Usagi",
    game_id = "com.kadphol.cozykingdom.usagi",
    game_width = Config.game_width,
    game_height = Config.game_height,
    pixel_perfect = true,
    pause_menu = false,
  }
end

function _init()
  math.randomseed(os.time())
  if input and input.set_mouse_visible then
    input.set_mouse_visible(true)
  end

  State = {
    phase = "start",
    world = World.new(),
  }
end

function _update(dt)
  dt = math.min(dt, 0.05)

  if State.phase == "start" then
    if Controls.start_pressed() then
      State.phase = "playing"
      State.world = World.new()
    end
    return
  end

  if State.phase == "game_over" then
    if Controls.restart_pressed() then
      State.phase = "playing"
      State.world = World.new()
    end
    return
  end

  World.update(State.world, dt, Controls.world_command())
  if State.world.result then
    State.phase = "game_over"
  end
end

function _draw(_dt)
  if State.phase == "start" then
    Rendering.draw_start()
    return
  end

  Rendering.draw_game(State.world)
  if State.phase == "game_over" and State.world.result then
    Rendering.draw_game_over(State.world.result)
  end
end
