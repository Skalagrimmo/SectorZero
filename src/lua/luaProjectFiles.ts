export interface LuaSourceFile {
  path: string;
  language: 'lua' | 'glsl' | 'markdown';
  summary: string;
  content: string;
}

export const LUA_PROJECT_FILES: LuaSourceFile[] = [
  {
    path: 'conf.lua',
    language: 'lua',
    summary: 'LÖVE2D Android config optimized for OpenGL ES 2.0 and legacy mobile GPUs.',
    content: `-- Sector Zero: LÖVE2D Android Configuration (LuaJIT + OpenGL ES 2.0)
function love.conf(t)
  t.identity = "sector_zero_fps_rpg"
  t.version = "11.4"
  t.console = false
  t.accelerometerjoystick = false
  t.externalstorage = true

  t.window.title = "Sector Zero"
  t.window.width = 960
  t.window.height = 540
  t.window.resizable = true
  t.window.vsync = 1
  t.window.msaa = 0          -- Disable MSAA for Adreno 305 / Mali-400 fill-rate
  t.window.depth = 0         -- Raycaster uses software 1D Z-buffer; saves VRAM
  t.window.stencil = 0
  t.window.usedpiscale = false

  -- Disable unused modules to minimize mobile RAM footprint
  t.modules.physics = false
  t.modules.video = false
  t.modules.joystick = true
  t.modules.touch = true
end
`,
  },
  {
    path: 'shaders/gles2_raycast.glsl',
    language: 'glsl',
    summary: 'OpenGL ES 2.0 mediump fragment shader for point lighting, elemental tint, and diegetic damage vignette.',
    content: `// Sector Zero - OpenGL ES 2.0 Post-Lighting & Diegetic Vignette Shader
// Compatible with Adreno 305, Mali-400 MP4, and PowerVR SGX544 (GLSL ES 1.00)
#ifdef GL_ES
precision mediump float;
#endif

extern float u_muzzleFlash;
extern float u_damageFlash;
extern float u_lowHp;
extern vec3  u_elementTint;
extern vec3  u_debuffColor;
extern float u_debuffIntensity;
extern float u_dashIframe;
extern float u_time;

vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
  vec4 col = Texel(tex, tc) * color;

  // Subtle barrel air scatter (world-space shadows handle full muzzle illumination)
  vec2 delta = tc - vec2(0.5, 0.55);
  float dist = length(delta);
  float flash = max(0.0, 1.0 - dist * 1.65) * u_muzzleFlash;
  col.rgb += u_elementTint * flash * 0.16;

  // Subtle electric-cyan perimeter rim during tactical dash i-frames
  if (u_dashIframe > 0.005) {
    float dashEdge = smoothstep(0.42, 0.84, dist);
    col.rgb = mix(col.rgb, vec3(0.13, 0.83, 0.93), dashEdge * clamp(u_dashIframe, 0.0, 1.0) * 0.42);
  }

  // Intensity-scaled elemental debuff perimeter vignette
  if (u_debuffIntensity > 0.005) {
    float debuffEdge = smoothstep(0.56 - u_debuffIntensity * 0.22, 0.86, dist);
    float debuffPulse = (u_debuffIntensity >= 0.30) ? (0.85 + 0.15 * sin(u_time * 5.2)) : 1.0;
    float debuffAlpha = clamp((0.18 + u_debuffIntensity * 0.64) * debuffEdge * debuffPulse, 0.0, 0.82);
    col.rgb = mix(col.rgb, u_debuffColor, debuffAlpha);
  }

  // Diegetic edge vignette for incoming damage & low-HP heartbeat
  float edge = smoothstep(0.32, 0.85, dist);
  float pulse = 0.5 + 0.5 * sin(u_time * 6.5);
  float danger = clamp(u_damageFlash * 0.85 + u_lowHp * (0.25 + 0.25 * pulse), 0.0, 0.9);
  col.rgb = mix(col.rgb, vec3(0.88, 0.11, 0.14), edge * danger);

  return vec4(clamp(col.rgb, 0.0, 1.0), col.a);
}
`,
  },
  {
    path: 'src/lighting.lua',
    language: 'lua',
    summary: 'Cached 2D sub-tile lightmap solver with 128-ray DDA wall/cover occlusion and strict 4-light GLES 2.0 mobile cap.',
    content: `-- Sector Zero: Cached 2D Shadow-Casting Lightmap (LuaJIT / GLES 2.0)
local Lighting = {}

Lighting.SUB = 4
Lighting.MAX_LIGHTS = 4
local NUM_RAYS = 128

local floor, ceil, abs, sqrt, min, max, sin, cos, atan2 =
  math.floor, math.ceil, math.abs, math.sqrt, math.min, math.max, math.sin, math.cos, math.atan2

local RAY_COS, RAY_SIN = {}, {}
for i = 0, NUM_RAYS - 1 do
  local theta = (i / NUM_RAYS) * math.pi * 2
  RAY_COS[i] = cos(theta)
  RAY_SIN[i] = sin(theta)
end

local fullDist, wallDist = {}, {}
local lmW, lmH = 0, 0
local lmR, lmG, lmB = {}, {}, {}
local activeCount = 0
local footprintCache = {}
local clusterVisited = {}
local candidates = {}

local WEAPON_LIGHT_RGB = {
  thermal = { 1.00, 0.48, 0.14 },
  cryo    = { 0.34, 0.84, 1.00 },
  shock   = { 0.42, 0.74, 1.00 },
  toxin   = { 0.24, 0.92, 0.48 },
  kinetic = { 1.00, 0.78, 0.42 },
}

local function ensureSize(gw, gh)
  local tw, th = gw * Lighting.SUB, gh * Lighting.SUB
  if lmW ~= tw or lmH ~= th then
    lmW, lmH = tw, th
    lmR, lmG, lmB = {}, {}, {}
    for i = 0, lmW * lmH - 1 do
      lmR[i], lmG[i], lmB[i] = 0, 0, 0
    end
    footprintCache = {}
  else
    for i = 0, lmW * lmH - 1 do
      lmR[i], lmG[i], lmB[i] = 0, 0, 0
    end
  end
end

local function isCellOpaque(sector, gx, gy)
  if gx < 1 or gy < 1 or gx > sector.w or gy > sector.h then return true end
  local cell = sector.grid[gy][gx]
  if cell.kind == "wall" then return true end
  if (cell.kind == "door" or cell.kind == "gate") and (cell.doorOpen or 0) < 0.7 then return true end
  return false
end

local function computeGeometryStamp(sector)
  local h = 2166136261
  local gw, gh = sector.w, sector.h
  for y = 1, gh do
    local row = sector.grid[y]
    for x = 1, gw do
      local c = row[x]
      local code = 0
      if c.kind == "wall" then
        code = 1
      elseif c.kind == "cover" and (c.coverHp or 0) > 0 then
        code = 2
      elseif (c.kind == "door" or c.kind == "gate") and (c.doorOpen or 0) < 0.7 then
        code = 3
      end
      if code ~= 0 then
        h = (h * 33 + (y * gw + x) * 7 + code) % 2147483647
      end
    end
  end
  return h
end

local function castOcclusionFan(sector, lx, ly, radius)
  local gw, gh = sector.w, sector.h
  local maxTrace = radius + 0.35

  for i = 0, NUM_RAYS - 1 do
    local rdx, rdy = RAY_COS[i], RAY_SIN[i]
    local mapX, mapY = floor(lx), floor(ly)
    local ddx = (rdx == 0) and 1e30 or abs(1 / rdx)
    local ddy = (rdy == 0) and 1e30 or abs(1 / rdy)

    local stepX = (rdx < 0) and -1 or 1
    local stepY = (rdy < 0) and -1 or 1
    local sdx = (rdx < 0) and ((lx - mapX) * ddx) or ((mapX + 1.0 - lx) * ddx)
    local sdy = (rdy < 0) and ((ly - mapY) * ddy) or ((mapY + 1.0 - ly) * ddy)

    local firstCover, hitWall = -1, maxTrace
    for _ = 1, 36 do
      local side
      if sdx < sdy then
        sdx = sdx + ddx; mapX = mapX + stepX; side = 0
      else
        sdy = sdy + ddy; mapY = mapY + stepY; side = 1
      end
      local dist = (side == 0) and (sdx - ddx) or (sdy - ddy)
      if dist >= maxTrace then break end
      if mapX < 1 or mapY < 1 or mapX > gw or mapY > gh then
        hitWall = dist; break
      end
      local cell = sector.grid[mapY][mapX]
      if cell.kind == "wall" or ((cell.kind == "door" or cell.kind == "gate") and (cell.doorOpen or 0) < 0.7) then
        hitWall = dist; break
      elseif cell.kind == "cover" and (cell.coverHp or 0) > 0 and firstCover < 0 then
        firstCover = dist
      end
    end

    wallDist[i] = hitWall
    fullDist[i] = (firstCover >= 0) and min(firstCover, hitWall) or hitWall
  end
end

local function rayVisAt(bin, dist)
  if dist <= fullDist[bin] + 0.16 then return 1.0 end
  if dist <= wallDist[bin] + 0.16 then return 0.18 end
  return 0.0
end

local function buildWeights(sector, lx, ly, radius, minSx, maxSx, minSy, maxSy, weights)
  castOcclusionFan(sector, lx, ly, radius)
  local invR = 1 / max(0.1, radius)
  local rSq = radius * radius
  local spanX = maxSx - minSx + 1
  local sub = Lighting.SUB

  for sy = minSy, maxSy do
    local wy = 1.0 + (sy + 0.5) / sub
    local gy = floor(wy)
    local dy = wy - ly
    local rowOff = (sy - minSy) * spanX

    for sx = minSx, maxSx do
      local wx = 1.0 + (sx + 0.5) / sub
      local gx = floor(wx)
      local idx = rowOff + (sx - minSx) + 1

      if isCellOpaque(sector, gx, gy) then
        weights[idx] = 0
      else
        local dx = wx - lx
        local dSq = dx * dx + dy * dy
        if dSq >= rSq then
          weights[idx] = 0
        else
          local dist = sqrt(dSq)
          local vis = 1.0
          if dist > 0.12 then
            local ang = atan2(dy, dx)
            if ang < 0 then ang = ang + math.pi * 2 end
            local fBin = (ang / (math.pi * 2)) * NUM_RAYS
            local b0 = floor(fBin) % NUM_RAYS
            local b1 = (b0 + 1) % NUM_RAYS
            local frac = fBin - floor(fBin)
            vis = rayVisAt(b0, dist) * (1 - frac) + rayVisAt(b1, dist) * frac
          end
          if vis <= 0.001 then
            weights[idx] = 0
          else
            local norm = dist * invR
            local falloff = (1 - norm) * (1 - norm)
            weights[idx] = (falloff / (1 + 0.34 * dSq)) * vis
          end
        end
      end
    end
  end
end

local function collectLights(sector, px, py, angle, muzzleFlash, weaponElement, time)
  for i = #candidates, 1, -1 do candidates[i] = nil end
  local gw, gh = sector.w, sector.h

  if muzzleFlash > 0.02 then
    local mx = px + cos(angle) * 0.36
    local my = py + sin(angle) * 0.36
    if isCellOpaque(sector, floor(mx), floor(my)) then
      mx, my = px, py
    end
    local rgb = WEAPON_LIGHT_RGB[weaponElement] or WEAPON_LIGHT_RGB.kinetic
    candidates[#candidates + 1] = {
      id = "muzzle", x = mx, y = my, radius = 6.4,
      r = rgb[1], g = rgb[2], b = rgb[3],
      intensity = 1.35 * muzzleFlash, priority = 1000, isDynamic = true,
    }
  end

  for i = 1, gw * gh do clusterVisited[i] = false end
  for y = 1, gh do
    local row = sector.grid[y]
    for x = 1, gw do
      local ci = (y - 1) * gw + x
      if not clusterVisited[ci] then
        local haz = row[x].hazard
        if haz == "burning" or haz == "electrified" or haz == "frozen" or haz == "coolant" or haz == "toxic" then
          local qx, qy = { x }, { y }
          local head, tail = 1, 1
          clusterVisited[ci] = true
          local sumX, sumY, count = 0, 0, 0
          while head <= tail do
            local cx, cy = qx[head], qy[head]
            head = head + 1
            sumX = sumX + cx + 0.5
            sumY = sumY + cy + 0.5
            count = count + 1
            local dirs = { {cx - 1, cy}, {cx + 1, cy}, {cx, cy - 1}, {cx, cy + 1} }
            for _, d in ipairs(dirs) do
              local nx, ny = d[1], d[2]
              if nx >= 1 and nx <= gw and ny >= 1 and ny <= gh then
                local ni = (ny - 1) * gw + nx
                if not clusterVisited[ni] and sector.grid[ny][nx].hazard == haz then
                  clusterVisited[ni] = true
                  tail = tail + 1
                  qx[tail], qy[tail] = nx, ny
                end
              end
            end
          end

          local lx, ly = sumX / count, sumY / count
          if isCellOpaque(sector, floor(lx), floor(ly)) then
            lx, ly = x + 0.5, y + 0.5
          end
          local dSq = (lx - px)^2 + (ly - py)^2
          if dSq <= 144 then
            local seed = x * 17 + y * 31
            local radBoost = min(1.0, (count - 1) * 0.24)
            local r, g, b, rad, inten = 1, 1, 1, 3.6 + radBoost, 0.7
            if haz == "burning" then
              r, g, b, rad = 1.0, 0.44, 0.10, 4.6 + radBoost
              inten = 0.98 * (0.84 + 0.16 * sin(time * 13 + seed) * cos(time * 7.3 + seed))
            elseif haz == "electrified" then
              r, g, b, rad = 0.36, 0.74, 1.0, 4.4 + radBoost
              inten = 0.94 * ((sin(time * 28 + seed) > 0.15) and 1.0 or 0.42)
            elseif haz == "frozen" then
              r, g, b, rad = 0.32, 0.84, 1.0, 3.8 + radBoost
              inten = 0.76 * (0.92 + 0.08 * sin(time * 2.8 + seed))
            elseif haz == "coolant" then
              r, g, b, rad = 0.20, 0.72, 0.96, 3.4 + radBoost
              inten = 0.56 * (0.90 + 0.10 * sin(time * 3.1 + seed))
            else
              r, g, b, rad = 0.22, 0.92, 0.42, 3.7 + radBoost
              inten = 0.72 * (0.88 + 0.12 * sin(time * 4.2 + seed))
            end
            candidates[#candidates + 1] = {
              id = "haz_" .. haz .. "_" .. x .. "_" .. y,
              x = lx, y = ly, radius = rad, r = r, g = g, b = b,
              intensity = inten, priority = (inten * 2.4) / (dSq + 0.75), isDynamic = false,
            }
          end
        end
      end
    end
  end

  for idx, e in ipairs(sector.entities) do
    if not e.dead and (e.kind == "barrel_fuel" or e.kind == "barrel_cryo" or e.kind == "barrel_shock") then
      local dSq = (e.x - px)^2 + (e.y - py)^2
      if dSq <= 110 then
        local pulse = 0.86 + 0.14 * sin(time * 4.5 + idx * 1.9)
        local r, g, b, inten = 1.0, 0.38, 0.12, 0.54 * pulse
        if e.kind == "barrel_cryo" then
          r, g, b, inten = 0.28, 0.82, 1.0, 0.52 * pulse
        elseif e.kind == "barrel_shock" then
          r, g, b = 0.40, 0.72, 1.0
          inten = 0.56 * ((sin(time * 19 + idx) > 0.25) and 1.0 or 0.62)
        end
        candidates[#candidates + 1] = {
          id = "bar_" .. idx, x = e.x, y = e.y, radius = 2.75,
          r = r, g = g, b = b, intensity = inten,
          priority = (inten * 1.65) / (dSq + 0.8), isDynamic = false,
        }
      end
    end
  end

  if #candidates > Lighting.MAX_LIGHTS then
    table.sort(candidates, function(a, b) return a.priority > b.priority end)
    for i = #candidates, Lighting.MAX_LIGHTS + 1, -1 do
      candidates[i] = nil
    end
  end
end

function Lighting.solve(sector, px, py, angle, muzzleFlash, weaponElement, time)
  ensureSize(sector.w, sector.h)
  collectLights(sector, px, py, angle, muzzleFlash, weaponElement, time)
  activeCount = #candidates
  if activeCount == 0 then return end

  local geomStamp = computeGeometryStamp(sector)
  local sub = Lighting.SUB

  for _, L in ipairs(candidates) do
    local minSx = max(0, floor((L.x - L.radius - 1) * sub))
    local maxSx = min(lmW - 1, ceil((L.x + L.radius - 1) * sub))
    local minSy = max(0, floor((L.y - L.radius - 1) * sub))
    local maxSy = min(lmH - 1, ceil((L.y + L.radius - 1) * sub))
    local spanX = maxSx - minSx + 1
    local spanY = maxSy - minSy + 1

    if spanX > 0 and spanY > 0 then
      local weights
      if L.isDynamic then
        local cached = footprintCache.__muzzle
        if not cached or #cached < spanX * spanY then
          cached = {}
          footprintCache.__muzzle = cached
        end
        weights = cached
        buildWeights(sector, L.x, L.y, L.radius, minSx, maxSx, minSy, maxSy, weights)
      else
        local c = footprintCache[L.id]
        if c and c.geomStamp == geomStamp and abs(c.lx - L.x) < 0.02 and abs(c.ly - L.y) < 0.02 and c.minSx == minSx and c.maxSx == maxSx and c.minSy == minSy and c.maxSy == maxSy then
          weights = c.weights
        else
          weights = {}
          buildWeights(sector, L.x, L.y, L.radius, minSx, maxSx, minSy, maxSy, weights)
          footprintCache[L.id] = {
            geomStamp = geomStamp, lx = L.x, ly = L.y,
            minSx = minSx, maxSx = maxSx, minSy = minSy, maxSy = maxSy,
            weights = weights,
          }
        end
      end

      local lr, lg, lb = L.r * L.intensity, L.g * L.intensity, L.b * L.intensity
      for sy = minSy, maxSy do
        local wRow = (sy - minSy) * spanX
        local lmRow = sy * lmW
        for sx = minSx, maxSx do
          local w = weights[wRow + (sx - minSx) + 1]
          if w and w > 0.001 then
            local off = lmRow + sx
            lmR[off] = lmR[off] + lr * w
            lmG[off] = lmG[off] + lg * w
            lmB[off] = lmB[off] + lb * w
          end
        end
      end
    end
  end
end

function Lighting.sample(wx, wy)
  if activeCount == 0 or lmW <= 0 then return 0, 0, 0 end
  local sx = min(lmW - 1, max(0, floor((wx - 1) * Lighting.SUB)))
  local sy = min(lmH - 1, max(0, floor((wy - 1) * Lighting.SUB)))
  local off = sy * lmW + sx
  return lmR[off], lmG[off], lmB[off]
end

return Lighting
`,
  },
  {
    path: 'src/atlas.lua',
    language: 'lua',
    summary: '1408x768 sprite sheet UV definitions and edge flood-fill background keyer.',
    content: `-- Sector Zero: Sprite Sheet Atlas & Edge Flood-Fill Alpha Keyer
local Atlas = {}

Atlas.RECTS = {
  -- Walls
  wall_concrete_clean   = { x = 4,   y = 2,   w = 103, h = 111, alpha = false },
  wall_concrete_cracked = { x = 115, y = 2,   w = 105, h = 111, alpha = false },
  wall_panel_blue       = { x = 228, y = 2,   w = 112, h = 111, alpha = false },
  wall_brick_gray       = { x = 352, y = 2,   w = 110, h = 111, alpha = false },
  wall_shutter_rust     = { x = 590, y = 2,   w = 106, h = 111, alpha = false },
  wall_graffiti_guads   = { x = 4,   y = 124, w = 103, h = 112, alpha = false },
  wall_brick_red        = { x = 352, y = 124, w = 110, h = 112, alpha = false },
  wall_vent_rust        = { x = 470, y = 124, w = 109, h = 112, alpha = false },

  -- Floors & Doors
  floor_concrete_a      = { x = 3,    y = 270, w = 102, h = 111, alpha = false },
  floor_vent_cyan       = { x = 230,  y = 387, w = 96,  h = 109, alpha = false },
  floor_grate_steel     = { x = 352,  y = 387, w = 109, h = 109, alpha = false },
  door_blue_locked      = { x = 980,  y = 236, w = 50,  h = 97,  alpha = false },
  door_steel_rust       = { x = 1117, y = 236, w = 51,  h = 97,  alpha = false },

  -- Destructible Cover & Interactives (Alpha Keyed)
  cover_crate_wood      = { x = 713, y = 437, w = 47, h = 74, alpha = true },
  cover_crate_ammo      = { x = 777, y = 437, w = 48, h = 74, alpha = true },
  cover_server_rack     = { x = 381, y = 521, w = 53, h = 92, alpha = true },
  prop_terminal_green   = { x = 843, y = 236, w = 73, h = 97, alpha = true },
  prop_vending_red      = { x = 715, y = 7,   w = 84, h = 176, alpha = true },

  -- Weapons & Pickups
  weapon_pistol         = { x = 964,  y = 384, w = 50,  h = 42, alpha = true },
  weapon_smg            = { x = 844,  y = 444, w = 94,  h = 52, alpha = true },
  weapon_rifle          = { x = 1068, y = 382, w = 138, h = 48, alpha = true },
  weapon_shotgun        = { x = 1222, y = 382, w = 82,  h = 44, alpha = true },
  obj_medkit            = { x = 713,  y = 387, w = 47,  h = 39, alpha = true },

  -- Enemies & NPCs
  enemy_guard_1         = { x = 715,  y = 551, w = 35, h = 77, alpha = true },
  enemy_mercenary       = { x = 834,  y = 551, w = 36, h = 77, alpha = true },
  enemy_rat_1           = { x = 978,  y = 572, w = 42, h = 56, alpha = true },
  enemy_droid_1         = { x = 1193, y = 551, w = 35, h = 77, alpha = true },
  npc_hazmat            = { x = 894,  y = 649, w = 38, h = 97, alpha = true },
  npc_agent             = { x = 1264, y = 437, w = 34, h = 74, alpha = true },
}

local function isGridBackground(r, g, b)
  local maxC = math.max(r, g, b)
  local minC = math.min(r, g, b)
  return maxC < 0.22 and (maxC - minC) < 0.07 and b >= (r - 0.01)
end

local function floodFillKey(imgData, w, h)
  local visited = {}
  local qx, qy = {}, {}
  local head, tail = 1, 0

  local function push(x, y)
    if x < 0 or y < 0 or x >= w or y >= h then return end
    local idx = y * w + x
    if visited[idx] then return end
    local r, g, b = imgData:getPixel(x, y)
    if isGridBackground(r, g, b) then
      visited[idx] = true
      tail = tail + 1
      qx[tail], qy[tail] = x, y
    end
  end

  for x = 0, w - 1 do push(x, 0); push(x, h - 1) end
  for y = 0, h - 1 do push(0, y); push(w - 1, y) end

  while head <= tail do
    local x, y = qx[head], qy[head]
    head = head + 1
    local r, g, b = imgData:getPixel(x, y)
    imgData:setPixel(x, y, r, g, b, 0)
    push(x + 1, y); push(x - 1, y)
    push(x, y + 1); push(x, y - 1)
  end
end

local function bakeDamageFrame(srcData, w, h, stage)
  local out = love.image.newImageData(w, h)
  out:paste(srcData, 0, 0, 0, 0, w, h)
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local r, g, b, a = out:getPixel(x, y)
      local diagA = (x + y * 2) % (stage == 1 and 23 or 15)
      local diagB = (x * 2 - y + 128) % (stage == 1 and 29 or 19)
      local hash = (x * 73 + y * 137) % 32
      local isCrack = (diagA == 0) or (stage == 2 and diagB <= 1) or (stage == 1 and diagB == 0 and y < h * 0.72)
      local isChip = (y < (stage == 1 and 10 or 20) and hash < (stage == 1 and 8 or 16)) or (stage == 2 and hash < 5 and y < h * 0.85)
      if isChip then
        out:setPixel(x, y, r * 0.22, g * 0.22, b * 0.24, a)
      elseif isCrack then
        out:setPixel(x, y, r * 0.34, g * 0.33, b * 0.35, a)
      elseif stage == 2 then
        out:setPixel(x, y, r * 0.84, g * 0.82, b * 0.80, a)
      end
    end
  end
  local img = love.graphics.newImage(out)
  img:setFilter("nearest", "nearest")
  return { image = img, data = out, w = w, h = h }
end

function Atlas.load(sheetPath)
  local srcData = love.image.newImageData(sheetPath)
  local entries = {}

  for id, rect in pairs(Atlas.RECTS) do
    local sub = love.image.newImageData(rect.w, rect.h)
    sub:paste(srcData, 0, 0, rect.x, rect.y, rect.w, rect.h)
    if rect.alpha then
      floodFillKey(sub, rect.w, rect.h)
    end
    local img = love.graphics.newImage(sub)
    img:setFilter("nearest", "nearest")
    entries[id] = { image = img, data = sub, w = rect.w, h = rect.h }

    if not rect.alpha then
      entries[id .. "_dmg1"] = bakeDamageFrame(sub, rect.w, rect.h, 1)
      entries[id .. "_dmg2"] = bakeDamageFrame(sub, rect.w, rect.h, 2)
    end
  end

  return entries
end

return Atlas
`,
  },
  {
    path: 'src/raycaster.lua',
    language: 'lua',
    summary: '2.5D DDA raycaster with destructible partial cover and low-draw-call OpenGL ES billboard pass.',
    content: `-- Sector Zero: 2.5D DDA Raycaster & Sprite Billboard Renderer
-- Tuned for LuaJIT + OpenGL ES 2.0 (low-resolution offscreen canvas + hardware quad scaling)
local Lighting = require("src.lighting")
local Raycaster = {}

local RW, RH = 480, 270
local zBuffer = {}
local fbData = love.image.newImageData(RW, RH)
local fbImage = love.graphics.newImage(fbData)
fbImage:setFilter("nearest", "nearest")

local floor, abs, max, min = math.floor, math.abs, math.max, math.min

local STATUS_BITMAPS = {
  thermal = {
    "..#.#..", ".#121#.", "#1221#.", "#12211#", "#11221#", ".#111#.", "..###.."
  },
  cryo = {
    "..###..", ".#212#.", "#21212#", "#12221#", "#21212#", ".#212#.", "..###.."
  },
  shock = {
    "..####.", ".#221#.", "#221#..", "#1222#.", "..#21#.", ".#21#..", ".###..."
  },
  toxin = {
    "..###..", ".#121#.", "#12221#", "#12121#", "#11211#", ".#111#.", "..###.."
  },
}

local STATUS_PALETTES = {
  thermal = { {0.94, 0.33, 0.14}, {0.98, 0.75, 0.14} },
  cryo    = { {0.22, 0.74, 0.97}, {0.88, 0.95, 1.00} },
  shock   = { {0.38, 0.65, 0.98}, {1.00, 0.94, 0.54} },
  toxin   = { {0.02, 0.59, 0.41}, {0.20, 0.83, 0.60} },
}

local statusImages = {}
for elem, rows in pairs(STATUS_BITMAPS) do
  local imgData = love.image.newImageData(7, 7)
  local pal = STATUS_PALETTES[elem]
  for y = 0, 6 do
    local line = rows[y + 1]
    for x = 0, 6 do
      local ch = line:sub(x + 1, x + 1)
      if ch == "#" then
        imgData:setPixel(x, y, 0.04, 0.05, 0.07, 1)
      elseif ch == "1" then
        imgData:setPixel(x, y, pal[1][1], pal[1][2], pal[1][3], 1)
      elseif ch == "2" then
        imgData:setPixel(x, y, pal[2][1], pal[2][2], pal[2][3], 1)
      else
        imgData:setPixel(x, y, 0, 0, 0, 0)
      end
    end
  end
  local img = love.graphics.newImage(imgData)
  img:setFilter("nearest", "nearest")
  statusImages[elem] = img
end

function Raycaster.getSize()
  return RW, RH
end

function Raycaster.render(state, atlas)
  local px, py, angle = state.px, state.py, state.angle
  local dirX, dirY = math.cos(angle), math.sin(angle)
  local fovScale = 0.66 + (state.dashFovOffset or 0)
  local planeX, planeY = -dirY * fovScale, dirX * fovScale
  local horizon = floor(RH * 0.5 + state.pitch * RH + state.bob)
  local grid = state.sector.grid
  local gw, gh = state.sector.w, state.sector.h

  -- Index surface blood & oil decals into fast per-tile buckets
  local floorBuckets, wallBuckets = nil, nil
  local decals = state.sector.decals
  if decals and #decals > 0 then
    for i = 1, #decals do
      local d = decals[i]
      if d.surface == "floor" and d.x and d.y and d.radius then
        floorBuckets = floorBuckets or {}
        local minGx = max(1, floor(d.x - d.radius * 1.45))
        local maxGx = min(gw, floor(d.x + d.radius * 1.45))
        local minGy = max(1, floor(d.y - d.radius * 1.45))
        local maxGy = min(gh, floor(d.y + d.radius * 1.45))
        for gy = minGy, maxGy do
          for gx = minGx, maxGx do
            local k = gy * gw + gx
            floorBuckets[k] = floorBuckets[k] or {}
            floorBuckets[k][#floorBuckets[k] + 1] = d
          end
        end
      elseif d.surface == "wall" and d.side ~= nil then
        wallBuckets = wallBuckets or {}
        local k = (d.ty * gw + d.tx) * 2 + d.side
        wallBuckets[k] = wallBuckets[k] or {}
        wallBuckets[k][#wallBuckets[k] + 1] = d
      end
    end
  end

  local wep = state.player and state.player.activeWeapon
  Lighting.solve(state.sector, px, py, angle, state.muzzleFlash or 0, wep and wep.element or "kinetic", state.time or 0)

  local rayDirX0, rayDirY0 = dirX - planeX, dirY - planeY
  local rayDirX1, rayDirY1 = dirX + planeX, dirY + planeY
  local posZ = 0.5 * RH

  -- Clear ceiling & floor gradient + spatial-bucketed blood/oil floor decals + localized shadow lightmap
  fbData:mapPixel(function(x, y)
    if y < horizon then
      local t = (horizon - y) / RH
      local r, g, b = 0.05 + t * 0.04, 0.06 + t * 0.04, 0.08 + t * 0.05
      local p = horizon - y
      local rowDist = (p == 0) and 100 or (posZ / p)
      if rowDist <= 16 then
        local u = x / RW
        local fx = px + rowDist * (rayDirX0 + (rayDirX1 - rayDirX0) * u)
        local fy = py + rowDist * (rayDirY0 + (rayDirY1 - rayDirY0) * u)
        local lr, lg, lb = Lighting.sample(fx, fy)
        r = min(1.0, r * (0.66 + lr * 0.48))
        g = min(1.0, g * (0.66 + lg * 0.48))
        b = min(1.0, b * (0.66 + lb * 0.48))
      end
      return r, g, b, 1
    else
      local t = (y - horizon) / RH
      local r, g, b = 0.08 + t * 0.08, 0.09 + t * 0.08, 0.11 + t * 0.08
      local p = y - horizon
      local rowDist = (p == 0) and 100 or (posZ / p)
      if rowDist <= 16 then
        local u = x / RW
        local fx = px + rowDist * (rayDirX0 + (rayDirX1 - rayDirX0) * u)
        local fy = py + rowDist * (rayDirY0 + (rayDirY1 - rayDirY0) * u)
        if floorBuckets then
          local fDecs = floorBuckets[floor(fy) * gw + floor(fx)]
          if fDecs then
            for i = 1, #fDecs do
              local dec = fDecs[i]
              local ddx, ddy = fx - dec.x, fy - dec.y
              local drx, dry = dec.dirX or 1, dec.dirY or 0
              local along = ddx * drx + ddy * dry
              local perp = -ddx * dry + ddy * drx
              local sAlong = (along > 0) and (along / 1.45) or (along * 1.15)
              local ang = math.atan2(ddy, ddx)
              local lobe = 1.0 + 0.24 * math.sin(ang * 3 + dec.seed) + 0.14 * math.cos(ang * 5 - dec.seed * 0.7)
              local effR = dec.radius * lobe
              local distSq = sAlong * sAlong + perp * perp
              if distSq <= effR * effR then
                local rim = math.sqrt(distSq) / max(0.01, effR)
                local fog = min(1.0, rowDist * 0.08)
                if dec.kind == "blood" then
                  local mix = (rim < 0.72) and 0.82 or 0.66
                  local cr = (rim < 0.72) and 0.52 or 0.30
                  local cg = (rim < 0.72) and 0.06 or 0.035
                  local cb = (rim < 0.72) and 0.09 or 0.055
                  r = r * (1 - mix) + (cr * (1 - fog) + 0.04 * fog) * mix
                  g = g * (1 - mix) + (cg * (1 - fog) + 0.05 * fog) * mix
                  b = b * (1 - mix) + (cb * (1 - fog) + 0.08 * fog) * mix
                else
                  local mix = (rim < 0.76) and 0.85 or 0.70
                  local cr = (rim > 0.76) and 0.15 or 0.06
                  local cg = (rim > 0.76) and 0.20 or 0.08
                  local cb = (rim > 0.76) and 0.27 or 0.11
                  r = r * (1 - mix) + (cr * (1 - fog) + 0.04 * fog) * mix
                  g = g * (1 - mix) + (cg * (1 - fog) + 0.05 * fog) * mix
                  b = b * (1 - mix) + (cb * (1 - fog) + 0.08 * fog) * mix
                end
              end
            end
          end
        end
        local lr, lg, lb = Lighting.sample(fx, fy)
        r = min(1.0, r * min(1.55, 0.66 + lr))
        g = min(1.0, g * min(1.55, 0.66 + lg))
        b = min(1.0, b * min(1.55, 0.66 + lb))
      end
      return r, g, b, 1
    end
  end)

  -- Column DDA Raycast for walls, doors, and destructible cover
  for x = 0, RW - 1 do
    local camX = (2 * x) / RW - 1
    local rdx, rdy = dirX + planeX * camX, dirY + planeY * camX
    local mapX, mapY = floor(px), floor(py)
    local ddx = (rdx == 0) and 1e30 or abs(1 / rdx)
    local ddy = (rdy == 0) and 1e30 or abs(1 / rdy)

    local stepX, sdx = 1, (mapX + 1.0 - px) * ddx
    if rdx < 0 then stepX = -1; sdx = (px - mapX) * ddx end

    local stepY, sdy = 1, (mapY + 1.0 - py) * ddy
    if rdy < 0 then stepY = -1; sdy = (py - mapY) * ddy end

    local hit, side, texId = false, 0, "wall_concrete_clean"
    local covers = {}

    for _ = 1, 44 do
      if sdx < sdy then
        sdx = sdx + ddx; mapX = mapX + stepX; side = 0
      else
        sdy = sdy + ddy; mapY = mapY + stepY; side = 1
      end
      if mapX < 1 or mapY < 1 or mapX > gw or mapY > gh then hit = true; break end

      local cell = grid[mapY][mapX]
      if cell.kind == "wall" or (cell.kind == "door" and cell.doorOpen < 0.9) then
        hit = true
        texId = cell.wallTex
        break
      elseif cell.kind == "cover" and cell.coverHp > 0 then
        local cDist = (side == 0) and (sdx - ddx) or (sdy - ddy)
        local cWallX = (side == 0) and (py + cDist * rdy) or (px + cDist * rdx)
        cWallX = cWallX - floor(cWallX)
        local hpPct = cell.coverHp / max(1, cell.coverMaxHp or 60)
        local stage = (hpPct > 0.66) and 0 or ((hpPct > 0.33) and 1 or 2)
        local vScale = cell.coverVisualScale or ((stage == 0) and 1.0 or ((stage == 1) and 0.88 or 0.68))
        covers[#covers + 1] = {
          tx = mapX,
          ty = mapY,
          dist = max(0.15, cDist),
          wallX = cWallX,
          side = side,
          tex = cell.wallTex,
          hFrac = (cell.coverHeight or 0.65) * vScale,
          stage = stage,
          shake = cell.coverShake or 0,
        }
      end
    end

    local dist = max(0.15, (side == 0) and (sdx - ddx) or (sdy - ddy))
    zBuffer[x] = dist

    local lineH = floor(RH / dist)
    local y0 = max(0, floor(-lineH / 2 + horizon))
    local y1 = min(RH - 1, floor(lineH / 2 + horizon))
    local wallX = (side == 0) and (py + dist * rdy) or (px + dist * rdx)
    wallX = wallX - floor(wallX)

    local spr = atlas[texId]
    local tx = min(spr.w - 1, max(0, floor(wallX * spr.w)))
    local shade = (side == 1) and 0.72 or 1.0
    local fog = min(1.0, dist * 0.08)

    local wSampleX = (side == 0) and ((rdx > 0) and (mapX - 0.14) or (mapX + 1.14)) or (mapX + wallX)
    local wSampleY = (side == 1) and ((rdy > 0) and (mapY - 0.14) or (mapY + 1.14)) or (mapY + wallX)
    local wlr, wlg, wlb = Lighting.sample(wSampleX, wSampleY)
    local wLitR, wLitG, wLitB = min(1.55, 0.66 + wlr), min(1.55, 0.66 + wlg), min(1.55, 0.66 + wlb)

    local colDecals = nil
    if wallBuckets then
      local wDecs = wallBuckets[(mapY * gw + mapX) * 2 + side]
      if wDecs then
        for i = 1, #wDecs do
          local wd = wDecs[i]
          if abs(wallX - wd.u) <= wd.radU * 1.35 then
            colDecals = colDecals or {}
            colDecals[#colDecals + 1] = wd
          end
        end
      end
    end

    local wallTopY = -lineH / 2 + horizon
    local invLineH = 1 / max(1, lineH)

    for y = y0, y1 do
      local ty = min(spr.h - 1, max(0, floor(((y - horizon + lineH / 2) / max(1, lineH)) * spr.h)))
      local r, g, b = spr.data:getPixel(tx, ty)
      if colDecals then
        local wallV = (y - wallTopY) * invLineH
        for i = 1, #colDecals do
          local wd = colDecals[i]
          local du, dv = wallX - wd.u, wallV - wd.v
          local normU, normV = du / wd.radU, dv / wd.radV
          local lobe = 0.85 + 0.25 * math.sin(du * 38 + wd.seed)
          local inSplash = (normU * normU + normV * normV) <= lobe
          local inDrip = dv > 0 and dv < wd.radV * 2.1 and abs(du) < wd.radU * 0.72 and abs(math.sin(du * 46 + wd.seed)) > 0.83
          if inSplash or inDrip then
            if wd.kind == "blood" then
              local mix = inSplash and 0.84 or 0.72
              local cr = inSplash and 0.50 or 0.34
              local cg = inSplash and 0.055 or 0.035
              local cb = inSplash and 0.08 or 0.055
              r = r * (1 - mix) + cr * mix
              g = g * (1 - mix) + cg * mix
              b = b * (1 - mix) + cb * mix
            else
              local mix = inSplash and 0.86 or 0.74
              r = r * (1 - mix) + 0.07 * mix
              g = g * (1 - mix) + 0.095 * mix
              b = b * (1 - mix) + 0.13 * mix
            end
          end
        end
      end
      r = min(1.0, r * shade * wLitR * (1 - fog) + 0.04 * fog)
      g = min(1.0, g * shade * wLitG * (1 - fog) + 0.05 * fog)
      b = min(1.0, b * shade * wLitB * (1 - fog) + 0.08 * fog)
      fbData:setPixel(x, y, r, g, b, 1)
    end

    -- Draw destructible partial cover with 3-stage frames, jagged crown, and hit shake
    for i = #covers, 1, -1 do
      local cov = covers[i]
      if cov.dist < dist then
        local cLineH = floor(RH / cov.dist)
        local shakeY = (cov.shake > 0.01) and floor(math.sin(state.time * 65 + cov.tx) * cov.shake * 2.5) or 0
        local cBot = min(RH - 1, floor(cLineH / 2 + horizon) + shakeY)
        local notch = 0
        if cov.stage >= 1 then
          local uBucket = floor(cov.wallX * 12)
          local seed = (uBucket * 17 + cov.tx * 31 + cov.ty * 13) % 8
          notch = (cov.stage == 2) and (seed * 0.028) or ((seed < 4) and (seed * 0.014) or 0)
        end
        local effH = max(0.18, cov.hFrac - notch)
        local cTop = max(0, floor(cBot - cLineH * effH))
        local texKey = (cov.stage > 0) and (cov.tex .. "_dmg" .. cov.stage) or cov.tex
        local cSpr = atlas[texKey] or atlas[cov.tex]
        local shakeU = (cov.shake > 0.01) and (math.sin(state.time * 80) * cov.shake * 0.03) or 0
        local wrappedX = (cov.wallX + shakeU + 1) % 1
        local ctx = min(cSpr.w - 1, max(0, floor(wrappedX * cSpr.w)))
        local cSampleX = (cov.side == 0) and ((rdx > 0) and (cov.tx - 0.14) or (cov.tx + 1.14)) or (cov.tx + cov.wallX)
        local cSampleY = (cov.side == 1) and ((rdy > 0) and (cov.ty - 0.14) or (cov.ty + 1.14)) or (cov.ty + cov.wallX)
        local clr, clg, clb = Lighting.sample(cSampleX, cSampleY)
        local cLitR, cLitG, cLitB = min(1.55, 0.66 + clr), min(1.55, 0.66 + clg), min(1.55, 0.66 + clb)
        for y = cTop, cBot do
          local cty = min(cSpr.h - 1, max(0, floor(((y - cTop) / max(1, cBot - cTop)) * cSpr.h)))
          local r, g, b = cSpr.data:getPixel(ctx, cty)
          if cov.stage >= 1 and (y - cTop) < 2 then r, g, b = r * 0.55, g * 0.55, b * 0.55 end
          fbData:setPixel(x, y, min(1.0, r * 0.9 * cLitR), min(1.0, g * 0.9 * cLitG), min(1.0, b * 0.9 * cLitB), 1)
        end
      end
    end
  end

  fbImage:replacePixels(fbData)
  love.graphics.draw(fbImage, 0, 0)

  -- Hardware-accelerated OpenGL ES 2.0 sprite billboard pass clipped by Z-buffer columns
  local invDet = 1.0 / (planeX * dirY - dirX * planeY)
  table.sort(state.entities, function(a, b)
    local da = (a.x - px)^2 + (a.y - py)^2
    local db = (b.x - px)^2 + (b.y - py)^2
    return da > db
  end)

  for _, ent in ipairs(state.entities) do
    if not ent.dead then
      local sx, sy = ent.x - px, ent.y - py
      local tx = invDet * (dirY * sx - dirX * sy)
      local ty = invDet * (-planeY * sx + planeX * sy)
      if ty > 0.2 then
        local scrX = floor((RW / 2) * (1 + tx / ty))
        local spr = atlas[ent.spriteId]
        if spr then
          local spH = (RH / ty) * (ent.scale or 1.0)
          local spW = spH * (spr.w / spr.h)
          local colX = min(RW - 1, max(0, scrX))
          if ty < (zBuffer[colX] or 999) then
            local base = (RH / ty) * 0.5 + horizon
            local elr, elg, elb = Lighting.sample(ent.x, ent.y)
            love.graphics.setColor(min(1.0, 0.72 + elr * 0.85), min(1.0, 0.72 + elg * 0.85), min(1.0, 0.72 + elb * 0.85), 1)
            love.graphics.draw(spr.image, scrX - spW / 2, base - spH, 0, spW / spr.w, spH / spr.h)

            -- Draw overhead HP bar + 7x7 status glyph when damaged or afflicted
            local maxHp = ent.maxHp or ent.hp or 100
            local hasStatus = ent.statusElement and (ent.statusTimer or 0) > 0 and statusImages[ent.statusElement]
            if ent.hostile and ent.hp > 0 and ty < 10 and (ent.hp < maxHp or hasStatus) then
              local barW = max(12, min(36, floor(spW * 0.72)))
              local barX = max(hasStatus and 10 or 1, floor(scrX - barW / 2))
              local barY = max(4, floor(base - spH - 6))
              local fillW = max(0, min(barW, floor((ent.hp / maxHp) * barW)))

              love.graphics.setColor(0.04, 0.05, 0.07, 0.95)
              love.graphics.rectangle("fill", barX - 1, barY - 1, barW + 2, 4)
              love.graphics.setColor(0.11, 0.12, 0.16, 1)
              love.graphics.rectangle("fill", barX, barY, barW, 2)
              love.graphics.setColor(0.94, 0.27, 0.27, 1)
              love.graphics.rectangle("fill", barX, barY, fillW, 2)

              if hasStatus then
                local blinkOff = ent.statusTimer < 1.0 and (floor(state.time * 10) % 2 == 1)
                if not blinkOff then
                  love.graphics.setColor(1, 1, 1, 1)
                  love.graphics.draw(statusImages[ent.statusElement], barX - 9, barY - 3)
                end
              end
            end
          end
        end
      end
    end
  end

  -- 3D Particle Pass (Embers, Frost Mist, Shock Sparks) clipped against zBuffer
  if state.particles then
    for _, pt in ipairs(state.particles) do
      local sx, sy = pt.x - px, pt.y - py
      local tx = invDet * (dirY * sx - dirX * sy)
      local ty = invDet * (-planeY * sx + planeX * sy)
      if ty > 0.15 then
        local scrX = floor((RW / 2) * (1 + tx / ty))
        local scrY = floor(horizon + (0.5 - pt.z) * (RH / ty))
        local colX = min(RW - 1, max(0, scrX))
        if scrX >= 0 and scrX < RW and ty < (zBuffer[colX] or 999) then
          local rad = max(1, floor((pt.size * RH) / (ty * 140)))
          local alpha = (pt.alpha or 1) * max(0, min(1, pt.life / max(0.01, pt.maxLife)))
          love.graphics.setColor(pt.r, pt.g, pt.b, alpha)
          if pt.kind == "frost" then
            love.graphics.circle("fill", scrX, scrY, rad)
          else
            love.graphics.rectangle("fill", scrX - rad, scrY - rad, rad * 2 + 1, rad * 2 + 1)
          end
        end
      end
    end
    love.graphics.setColor(1, 1, 1, 1)
  end

  -- First-Person Weapon Viewmodel with Figure-8 Bob, Look Sway, Grip-Pivot Roll & Inspect Zoom
  local wep = state.player and state.player.activeWeapon
  local wepSpr = wep and atlas[wep.sprite]
  if wepSpr then
    local wm = state.weaponMotion or { offsetX = 0, offsetY = 0, roll = 0, scaleMult = 1.0, inspectGlow = 0 }
    local baseScale = max(2.2, RW / 170)
    local zoom = wm.scaleMult or 1.0
    local drawScale = baseScale * zoom
    local baseDrawW = wepSpr.w * baseScale
    local baseDrawH = wepSpr.h * baseScale
    local recoil = state.recoil or 0
    local recoilScale = (wep.archetype == "shotgun" and 1.35) or (wep.archetype == "rifle" and 1.12) or (wep.archetype == "pistol" and 0.9) or 1.0
    local recoilY = recoil * (RH * 0.11) * recoilScale
    local pivotX = RW * 0.56 + (wm.offsetX or 0) + baseDrawW * 0.72
    local pivotY = RH - baseDrawH + 10 + recoilY + (wm.offsetY or 0) + baseDrawH * 0.85
    local pivotOx, pivotOy = wepSpr.w * 0.72, wepSpr.h * 0.85
    local mf = state.muzzleFlash or 0
    local ig = wm.inspectGlow or 0
    local wlr, wlg, wlb = Lighting.sample(px, py)
    local envR = min(1.0, max(0.76, 0.78 + wlr * 0.55))
    local envG = min(1.0, max(0.76, 0.78 + wlg * 0.55))
    local envB = min(1.0, max(0.76, 0.78 + wlb * 0.55))
    local flashAdd = (mf > 0.05 and (mf * 0.38) or 0) + ig * 0.22
    love.graphics.setColor(min(1, envR + flashAdd * 0.75), min(1, envG + flashAdd * 0.9), min(1, envB + flashAdd), 1)
    love.graphics.draw(
      wepSpr.image,
      pivotX,
      pivotY,
      wm.roll or 0,
      drawScale,
      drawScale,
      pivotOx,
      pivotOy
    )
    love.graphics.setColor(1, 1, 1, 1)
  end
end

return Raycaster
`,
  },
  {
    path: 'src/physics.lua',
    language: 'lua',
    summary: 'Destructible cover physics and reactive elemental chain reactions.',
    content: `-- Sector Zero: Destructible Cover & Elemental Combat Physics
local Physics = {}

local ELEMENT_COMBOS = {
  thermal_oil     = { label = "THERMITE IGNITION", radius = 2.6, dmg = 55, newHazard = "burning" },
  shock_coolant   = { label = "ARC OVERLOAD",      radius = 3.2, dmg = 48, newHazard = "electrified" },
  cryo_thermal    = { label = "THERMAL SHOCK",     radius = 2.2, dmg = 42, newHazard = "none" },
  kinetic_frozen  = { label = "CRYO SHATTER",      radius = 2.0, dmg = 65, newHazard = "none" },
}

function Physics.damageCover(grid, tx, ty, dmg, element, particles)
  local cell = grid[ty] and grid[ty][tx]
  if not cell or cell.kind ~= "cover" or not cell.destructible then return false end

  local maxHp = math.max(1, cell.coverMaxHp or 60)
  local prevPct = cell.coverHp / maxHp
  local prevStage = (prevPct > 0.66) and 0 or ((prevPct > 0.33) and 1 or 2)

  local mult = (element == "kinetic" or element == "thermal") and 1.25 or 1.0
  cell.coverHp = cell.coverHp - dmg * mult
  cell.coverShake = 1.0

  if cell.coverHp <= 0 then
    cell.kind = "empty"
    cell.coverHp = 0
    cell.coverShake = 0
    return true -- Cover shattered, opening sightline & movement path
  end

  local nextPct = cell.coverHp / maxHp
  local nextStage = (nextPct > 0.66) and 0 or ((nextPct > 0.33) and 1 or 2)
  if particles and nextStage > prevStage then
    for _ = 1, 6 do
      local a = math.random() * math.pi * 2
      particles[#particles + 1] = {
        x = tx + 0.5, y = ty + 0.5, z = 0.42,
        vx = math.cos(a) * 1.8, vy = math.sin(a) * 1.8, vz = 1.4,
        r = 0.58, g = 0.62, b = 0.68, alpha = 1.0,
        size = 2.4, life = 0.45, maxLife = 0.45, kind = "ballistic", gravity = 6.5,
      }
    end
  end
  return false
end

function Physics.stepCoverAnimations(grid, dt)
  for y = 1, #grid do
    local row = grid[y]
    for x = 1, #row do
      local cell = row[x]
      if cell.kind == "cover" and cell.coverHp > 0 then
        if cell.coverShake and cell.coverShake > 0 then
          cell.coverShake = math.max(0, cell.coverShake - dt * 5.2)
        end
        local hpPct = cell.coverHp / math.max(1, cell.coverMaxHp or 60)
        local targetScale = (hpPct > 0.66) and 1.0 or ((hpPct > 0.33) and 0.88 or 0.68)
        local curScale = cell.coverVisualScale or 1.0
        cell.coverVisualScale = curScale + (targetScale - curScale) * math.min(1, dt * 10)
      end
    end
  end
end

function Physics.triggerElementalReaction(sector, gx, gy, incomingElement)
  local cell = sector.grid[gy] and sector.grid[gy][gx]
  if not cell then return nil end

  local comboKey = incomingElement .. "_" .. (cell.hazard or "none")
  local combo = ELEMENT_COMBOS[comboKey]
  if not combo then
    if incomingElement == "thermal" and cell.hazard == "none" then
      cell.hazard = "burning"; cell.hazardTimer = 6.0
    elseif incomingElement == "cryo" then
      cell.hazard = "frozen"; cell.hazardTimer = 8.0
    end
    return nil
  end

  cell.hazard = combo.newHazard
  cell.hazardTimer = 7.0

  for _, ent in ipairs(sector.entities) do
    if not ent.dead and ent.hostile then
      local d = math.sqrt((ent.x - gx)^2 + (ent.y - gy)^2)
      if d <= combo.radius then
        ent.hp = ent.hp - combo.dmg
        ent.statusElement = incomingElement
        ent.statusTimer = 3.5
        local invD = 1 / math.max(0.15, d)
        Physics.emitEntitySplatterDecals(sector, ent, (ent.x - gx) * invD, (ent.y - gy) * invD, ent.hp <= 0)
        if ent.hp <= 0 then ent.dead = true end
      end
    end
  end

  return combo.label
end

Physics.MAX_PARTICLES = 120

local function pushParticleCapped(particles, pt)
  if #particles >= Physics.MAX_PARTICLES then
    table.remove(particles, 1)
  end
  particles[#particles + 1] = pt
end

function Physics.emitStatusParticles(particles, ent)
  local elem = ent.statusElement
  if not elem then return end
  local angle = math.random() * math.pi * 2
  local rOff = 0.1 + math.random() * 0.24
  local sx = ent.x + math.cos(angle) * rOff
  local sy = ent.y + math.sin(angle) * rOff
  local sz = (0.22 + math.random() * 0.55) * (ent.scale or 1.0)

  if elem == "thermal" then
    local life = 0.55 + math.random() * 0.4
    pushParticleCapped(particles, {
      x = sx, y = sy, z = sz,
      vx = (math.random() - 0.5) * 0.55,
      vy = (math.random() - 0.5) * 0.55,
      vz = 0.65 + math.random() * 0.75,
      r = 0.96, g = 0.62, b = 0.04, alpha = 0.95,
      size = 2.0 + math.random() * 1.2,
      life = life, maxLife = life,
      kind = "ember", gravity = -1.6, drag = 1.1, jitter = 0.65, sizeGrowth = -0.9,
    })
  elseif elem == "cryo" then
    local life = 0.7 + math.random() * 0.45
    pushParticleCapped(particles, {
      x = sx, y = sy, z = sz * 0.85,
      vx = math.cos(angle) * (0.45 + math.random() * 0.45),
      vy = math.sin(angle) * (0.45 + math.random() * 0.45),
      vz = 0.06 - math.random() * 0.18,
      r = 0.49, g = 0.83, b = 0.99, alpha = 0.58,
      size = 3.8 + math.random() * 2.2,
      life = life, maxLife = life,
      kind = "frost", gravity = 0.22, drag = 2.5, jitter = 0.25, sizeGrowth = 2.4,
    })
  elseif elem == "shock" then
    for _ = 1, 2 do
      local a2 = math.random() * math.pi * 2
      local sp = 1.6 + math.random() * 2.2
      local life = 0.16 + math.random() * 0.16
      pushParticleCapped(particles, {
        x = sx, y = sy, z = sz,
        vx = math.cos(a2) * sp,
        vy = math.sin(a2) * sp,
        vz = (math.random() - 0.3) * 2.2,
        r = 0.38, g = 0.65, b = 0.98, alpha = 1.0,
        size = 1.8 + math.random() * 1.0,
        life = life, maxLife = life,
        kind = "spark", gravity = 0, drag = 3.2, jitter = 8.5, sizeGrowth = -1.5,
      })
    end
  end
end

function Physics.stepParticles(particles, dt)
  for i = #particles, 1, -1 do
    local pt = particles[i]
    pt.life = pt.life - dt
    if pt.life <= 0 then
      table.remove(particles, i)
    else
      if pt.drag and pt.drag > 0 then
        local damp = math.max(0, 1 - pt.drag * dt)
        pt.vx = pt.vx * damp
        pt.vy = pt.vy * damp
        if pt.kind == "spark" or pt.kind == "frost" then pt.vz = pt.vz * damp end
      end
      if pt.jitter and pt.jitter > 0 then
        pt.vx = pt.vx + (math.random() - 0.5) * pt.jitter * dt * 2
        pt.vy = pt.vy + (math.random() - 0.5) * pt.jitter * dt * 2
        if pt.kind == "spark" then
          pt.vz = pt.vz + (math.random() - 0.5) * pt.jitter * dt * 1.6
        end
      end
      pt.vz = pt.vz - (pt.gravity or 6.5) * dt
      pt.x = pt.x + pt.vx * dt
      pt.y = pt.y + pt.vy * dt
      pt.z = math.max(0.05, math.min(1.35, pt.z + pt.vz * dt))
      if pt.sizeGrowth then
        pt.size = math.max(0.8, pt.size + pt.sizeGrowth * dt)
      end
    end
  end
end

function Physics.emitFootstepParticles(particles, px, py, angle, cell, isSprinting, footSide)
  if not cell then return end
  local cosA, sinA = math.cos(angle), math.sin(angle)
  local fx = px + cosA * 0.45 - sinA * (0.16 * footSide)
  local fy = py + sinA * 0.45 + cosA * (0.16 * footSide)
  local count = isSprinting and 3 or 1
  local haz = cell.hazard or "none"
  local tex = cell.floorTex or "floor_concrete_a"

  for _ = 1, count do
    local spreadA = angle + math.pi + (math.random() - 0.5) * 1.9
    local sp = (isSprinting and 0.85 or 0.4) + math.random() * 0.5
    local r, g, b, alpha, kind, gravity, drag, size = 0.58, 0.64, 0.72, 0.45, "frost", 1.4, 3.6, 2.2
    local vz = (isSprinting and 0.65 or 0.35) + math.random() * 0.35

    if haz == "coolant" then
      r, g, b, alpha, kind, gravity, drag, size = 0.22, 0.74, 0.97, 0.85, "ballistic", 5.4, 1.8, 2.0
    elseif haz == "oil" then
      r, g, b, alpha, kind, gravity, drag, size = 0.16, 0.20, 0.28, 0.88, "ballistic", 6.0, 1.5, 2.0
    elseif haz == "frozen" then
      r, g, b, alpha, kind, gravity, drag, size = 0.88, 0.95, 1.00, 0.90, "ballistic", 4.6, 2.1, 1.9
    elseif haz == "burning" then
      r, g, b, alpha, kind, gravity, drag, size = 0.96, 0.62, 0.04, 0.92, "ember", -1.1, 1.8, 1.9
    elseif tex == "floor_grime" then
      r, g, b, alpha, kind, gravity, drag, size = 0.47, 0.44, 0.42, 0.68, "ballistic", 5.8, 1.8, 2.0
    elseif tex == "floor_metal_blue" or tex == "floor_grate_steel" then
      local spark = isSprinting and (math.random() < 0.25)
      if spark then
        r, g, b, alpha, kind, gravity, drag, size = 0.96, 0.62, 0.04, 0.92, "spark", 1.2, 2.6, 1.6
      else
        r, g, b, alpha, kind, gravity, drag, size = 0.58, 0.64, 0.72, 0.55, "ballistic", 5.2, 2.6, 1.8
      end
    elseif tex == "floor_vent_cyan" then
      r, g, b, alpha, kind, gravity, drag, size = 0.49, 0.83, 0.99, 0.42, "frost", -0.35, 3.2, 2.6
    end

    pushParticleCapped(particles, {
      x = fx, y = fy, z = 0.07,
      vx = math.cos(spreadA) * sp, vy = math.sin(spreadA) * sp, vz = vz,
      r = r, g = g, b = b, alpha = alpha,
      size = size, life = 0.35, maxLife = 0.35,
      kind = kind, gravity = gravity, drag = drag,
    })
  end
end

Physics.WEAPON_PROFILES = {
  pistol  = { swayScale = 0.72, recovery = 16.5, bobMult = 0.78, tiltScale = 0.75, sprintDrop = 8.5,  recoilKickX = 2.2, inspectDuration = 1.85 },
  smg     = { swayScale = 0.92, recovery = 14.0, bobMult = 0.96, tiltScale = 0.95, sprintDrop = 10.5, recoilKickX = 3.0, inspectDuration = 2.05 },
  rifle   = { swayScale = 1.12, recovery = 11.2, bobMult = 1.12, tiltScale = 1.12, sprintDrop = 13.0, recoilKickX = 4.0, inspectDuration = 2.35 },
  shotgun = { swayScale = 1.32, recovery = 9.2,  bobMult = 1.28, tiltScale = 1.28, sprintDrop = 15.5, recoilKickX = 6.2, inspectDuration = 2.50 },
}

function Physics.createWeaponMotion()
  return {
    weaponState = "ready",
    lookVelX = 0, lookVelY = 0,
    swayX = 0, swayY = 0,
    strafeLean = 0, moveBlend = 0, sprintBlend = 0, equipDip = 0,
    reloadTimer = 0, inspectProgress = 0, inspectBlend = 0,
    offsetX = 0, offsetY = 0, roll = 0, scaleMult = 1.0, inspectGlow = 0,
    dashLean = 0, dashDip = 0,
  }
end

function Physics.triggerWeaponInspect(wm)
  if wm.weaponState == "ready" then
    wm.weaponState = "inspecting"
    wm.inspectProgress = 0
  elseif wm.weaponState == "inspecting" then
    wm.weaponState = "ready"
  end
end

function Physics.cancelWeaponInspect(wm, nextState)
  if nextState ~= "inspecting" then
    wm.weaponState = nextState or "ready"
  end
end

local function clampVal(v, mn, mx)
  if v < mn then return mn elseif v > mx then return mx else return v end
end

function Physics.triggerWeaponDash(wm, dirStrafe, dirFwd)
  if wm.weaponState == "inspecting" then
    wm.weaponState = "ready"
  end
  local lean = (math.abs(dirStrafe or 0) > 0.1) and dirStrafe or ((dirFwd or 1) >= 0 and 0.35 or -0.35)
  wm.dashLean = clampVal(lean, -1, 1)
  wm.dashDip = 1.0
end

function Physics.canStep(sector, nx, ny)
  local m = 0.24
  local pts = {
    { nx - m, ny - m },
    { nx + m, ny - m },
    { nx - m, ny + m },
    { nx + m, ny + m },
  }
  for _, pt in ipairs(pts) do
    local gx, gy = math.floor(pt[1]), math.floor(pt[2])
    if gx < 1 or gy < 1 or gx > sector.w or gy > sector.h then return false end
    local cell = sector.grid[gy] and sector.grid[gy][gx]
    if not cell or cell.kind == "wall" then return false end
    if cell.kind == "cover" and (cell.coverHp or 0) > 0 then return false end
    if (cell.kind == "door" or cell.kind == "gate") and (cell.doorOpen or 0) < 0.75 then return false end
  end
  return true
end

local function smoothstep(e0, e1, x)
  local t = clampVal((x - e0) / math.max(0.0001, e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
end

local function evaluateInspectPose(archetype, t)
  local env = smoothstep(0, 0.16, t) * (1 - smoothstep(0.84, 1.0, t))
  local glow = env * (0.55 + 0.45 * math.sin(t * math.pi * 4))
  if archetype == "pistol" then
    return -22 * env + math.sin(t * math.pi * 2) * 6.5,
      -11 * env - math.sin(t * math.pi * 3) * 2.5,
      -0.28 * math.sin(t * math.pi) + 0.16 * math.sin(t * math.pi * 2.5),
      0.12 * env, glow
  elseif archetype == "smg" then
    return -24 * env + math.sin(t * math.pi * 2) * 4.5,
      -12 * env + math.cos(t * math.pi * 2) * 3.0,
      -0.24 * env + 0.12 * math.sin(t * math.pi * 3),
      0.14 * env, glow
  elseif archetype == "rifle" then
    return -38 * env + math.sin(t * math.pi * 1.5) * 7.5,
      -14 * env + math.sin(t * math.pi * 2) * 3.2,
      -0.22 * env - 0.06 * math.sin(t * math.pi * 2),
      0.10 * env, glow
  else
    local pump = math.exp(-((t - 0.52) / 0.085)^2)
    return -30 * env + pump * 5.5,
      -16 * env + pump * 5.5,
      -0.19 * env + pump * 0.09,
      0.13 * env, glow
  end
end

function Physics.stepWeaponMotion(wm, input, dt)
  local prof = Physics.WEAPON_PROFILES[input.archetype or "rifle"] or Physics.WEAPON_PROFILES.rifle

  if input.isSprinting and wm.weaponState == "inspecting" then
    wm.weaponState = "ready"
  end
  if wm.weaponState == "reloading" then
    wm.reloadTimer = math.max(0, wm.reloadTimer - dt)
    if wm.reloadTimer <= 0 then wm.weaponState = "ready" end
  elseif wm.weaponState == "equipping" then
    if wm.equipDip <= 0.04 then wm.weaponState = "ready" end
  elseif wm.weaponState == "firing" then
    if (input.recoil or 0) <= 0.08 then wm.weaponState = "ready" end
  elseif wm.weaponState == "inspecting" then
    wm.inspectProgress = wm.inspectProgress + dt / prof.inspectDuration
    if wm.inspectProgress >= 1.0 then
      wm.inspectProgress = 1.0
      wm.weaponState = "ready"
    end
  end

  local targetInspect = (wm.weaponState == "inspecting") and 1.0 or 0.0
  local blendRate = (targetInspect > wm.inspectBlend) and 10.5 or 16.5
  wm.inspectBlend = wm.inspectBlend + (targetInspect - wm.inspectBlend) * (1 - math.exp(-blendRate * dt))
  if wm.inspectBlend < 0.002 and targetInspect == 0 then wm.inspectBlend = 0 end

  local impX = -wm.lookVelX * 0.22 * prof.swayScale
  local impY = -wm.lookVelY * 0.16 * prof.swayScale
  wm.lookVelX, wm.lookVelY = 0, 0

  local decay = math.exp(-prof.recovery * dt)
  wm.swayX = clampVal((wm.swayX + impX) * decay, -18, 18)
  wm.swayY = clampVal((wm.swayY + impY) * decay, -12, 12)

  local blendAlpha = 1 - math.exp(-11.5 * dt)
  local targetMove = input.isMoving and 1.0 or 0.0
  local targetSprint = (input.isMoving and input.isSprinting) and 1.0 or 0.0
  local targetStrafe = input.isMoving and clampVal(input.moveStrafe or 0, -1, 1) or 0.0

  wm.moveBlend = wm.moveBlend + (targetMove - wm.moveBlend) * blendAlpha
  wm.sprintBlend = wm.sprintBlend + (targetSprint - wm.sprintBlend) * blendAlpha
  wm.strafeLean = wm.strafeLean + (targetStrafe - wm.strafeLean) * (1 - math.exp(-10 * dt))

  if wm.equipDip > 0 then
    wm.equipDip = math.max(0, wm.equipDip - dt * (prof.recovery * 0.34))
  end
  if math.abs(wm.dashLean or 0) > 0.001 then
    wm.dashLean = wm.dashLean * math.exp(-9.5 * dt)
    if math.abs(wm.dashLean) < 0.002 then wm.dashLean = 0 end
  end
  if (wm.dashDip or 0) > 0 then
    wm.dashDip = math.max(0, wm.dashDip - dt * 5.2)
  end

  local idleFactor = 1 - wm.moveBlend * 0.55
  local breathX = math.cos(input.time * 0.95) * 0.95 * idleFactor
  local breathY = math.sin(input.time * 1.9) * 1.45 * idleFactor

  local ampX = (4.3 + wm.sprintBlend * 2.5) * prof.bobMult * wm.moveBlend
  local ampY = (3.6 + wm.sprintBlend * 2.8) * prof.bobMult * wm.moveBlend
  local fig8X = math.cos(input.bobPhase) * ampX
  local fig8Y = (1 - math.abs(math.sin(input.bobPhase))) * ampY

  local strafeX = -wm.strafeLean * 4.8 * prof.swayScale
  local sprintX = wm.sprintBlend * 4.4
  local sprintY = wm.sprintBlend * prof.sprintDrop
  local equipY = wm.equipDip * wm.equipDip * 26
  local reloadPhase = (wm.reloadTimer > 0) and math.sin(clampVal(wm.reloadTimer / 0.65, 0, 1) * math.pi) or 0
  local reloadY = reloadPhase * 18
  local dashX = -(wm.dashLean or 0) * 12.5
  local dashY = (wm.dashDip or 0) * 9.0
  local dashRoll = -(wm.dashLean or 0) * 0.14 * prof.tiltScale
  local recoilX = (input.recoil or 0) * prof.recoilKickX

  local combatX = breathX + fig8X + wm.swayX + strafeX + sprintX + recoilX + dashX
  local combatY = breathY + fig8Y + wm.swayY + sprintY + equipY + reloadY + dashY
  local combatRoll = clampVal((
    -wm.strafeLean * 0.042
    + math.cos(input.bobPhase) * 0.022 * wm.moveBlend
    - (wm.swayX / 18) * 0.048
    - wm.sprintBlend * 0.055
  ) * prof.tiltScale + (input.recoil or 0) * 0.032 + reloadPhase * 0.14 + dashRoll, -0.22, 0.22)

  if wm.inspectBlend > 0.001 then
    local ix, iy, iroll, izoom, iglow = evaluateInspectPose(input.archetype or "rifle", wm.inspectProgress)
    local b = wm.inspectBlend
    local atten = 1 - b * 0.72
    wm.offsetX = combatX * atten + ix * b
    wm.offsetY = combatY * atten + iy * b
    wm.roll = clampVal(combatRoll * atten + iroll * b, -0.36, 0.36)
    wm.scaleMult = 1.0 + izoom * b
    wm.inspectGlow = iglow * b
  else
    wm.offsetX = combatX
    wm.offsetY = combatY
    wm.roll = combatRoll
    wm.scaleMult = 1.0
    wm.inspectGlow = 0
  end
end

function Physics.revealFogOfWar(sector, px, py, radius)
  local r = radius or 3
  local originX, originY = math.floor(px), math.floor(py)
  local minX = math.max(1, originX - r)
  local maxX = math.min(sector.w, originX + r)
  local minY = math.max(1, originY - r)
  local maxY = math.min(sector.h, originY + r)
  local maxRange = r + 0.35
  local changed = false

  for gy = minY, maxY do
    local row = sector.grid[gy]
    if row then
      for gx = minX, maxX do
        local cell = row[gx]
        if cell and not cell.visited then
          local dist = math.sqrt((gx - originX)^2 + (gy - originY)^2)
          if dist <= maxRange then
            local visible = true
            if dist > 0.5 then
              local steps = math.max(1, math.ceil(dist * 5))
              local sx, sy = originX + 0.5, originY + 0.5
              local dx, dy = (gx + 0.5 - sx) / steps, (gy + 0.5 - sy) / steps
              for i = 1, steps - 1 do
                local ix, iy = math.floor(sx + dx * i), math.floor(sy + dy * i)
                if not ((ix == originX and iy == originY) or (ix == gx and iy == gy)) then
                  local mid = sector.grid[iy] and sector.grid[iy][ix]
                  if not mid or mid.kind == "wall" or ((mid.kind == "door" or mid.kind == "gate") and (mid.doorOpen or 0) < 0.6) then
                    visible = false
                    break
                  end
                end
              end
            end
            if visible then
              cell.visited = true
              changed = true
            end
          end
        end
      end
    end
  end
  return changed
end

Physics.MAX_DECALS = 64

local function pushDecalCapped(sector, decal)
  sector.decals = sector.decals or {}
  if #sector.decals >= Physics.MAX_DECALS then
    table.remove(sector.decals, 1)
  end
  sector.decals[#sector.decals + 1] = decal
end

function Physics.getEntitySplatterKind(ent)
  if ent.kind == "enemy_droid" or ent.spriteId == "enemy_droid_1" then
    return "oil"
  end
  return "blood"
end

function Physics.emitEntitySplatterDecals(sector, ent, dirX, dirY, isFatal)
  local len = math.sqrt(dirX * dirX + dirY * dirY)
  if len < 0.001 then len = 1 end
  local rdx, rdy = dirX / len, dirY / len
  local kind = Physics.getEntitySplatterKind(ent)

  -- 1. Directional floor pool behind damaged target
  local fDist = 0.28 + math.random() * 0.56
  local fx = ent.x + rdx * fDist + (math.random() - 0.5) * 0.22
  local fy = ent.y + rdy * fDist + (math.random() - 0.5) * 0.22
  local fgx, fgy = math.floor(fx), math.floor(fy)
  local fCell = sector.grid[fgy] and sector.grid[fgy][fgx]
  if fCell and fCell.kind ~= "wall" then
    pushDecalCapped(sector, {
      surface = "floor", kind = kind, tx = fgx, ty = fgy,
      x = fx, y = fy, dirX = rdx, dirY = rdy,
      radius = (isFatal and 0.29 or 0.20) + math.random() * 0.14,
      seed = math.floor(math.random() * 1000),
    })
  end

  if isFatal then
    local ux, uy = ent.x + (math.random() - 0.5) * 0.14, ent.y + (math.random() - 0.5) * 0.14
    local ugx, ugy = math.floor(ux), math.floor(uy)
    local uCell = sector.grid[ugy] and sector.grid[ugy][ugx]
    if uCell and uCell.kind ~= "wall" then
      pushDecalCapped(sector, {
        surface = "floor", kind = kind, tx = ugx, ty = ugy,
        x = ux, y = uy, dirX = rdx, dirY = rdy,
        radius = 0.32 + math.random() * 0.13,
        seed = math.floor(math.random() * 1000),
      })
    end
  end

  -- 2. Behind-target wall splatter trace (up to 2.2 tiles)
  local mapX, mapY = math.floor(ent.x), math.floor(ent.y)
  local ddx = (rdx == 0) and 1e30 or math.abs(1 / rdx)
  local ddy = (rdy == 0) and 1e30 or math.abs(1 / rdy)
  local stepX = (rdx < 0) and -1 or 1
  local stepY = (rdy < 0) and -1 or 1
  local sdx = (rdx < 0) and ((ent.x - mapX) * ddx) or ((mapX + 1.0 - ent.x) * ddx)
  local sdy = (rdy < 0) and ((ent.y - mapY) * ddy) or ((mapY + 1.0 - ent.y) * ddy)
  local side = 0

  for _ = 1, 8 do
    if sdx < sdy then sdx = sdx + ddx; mapX = mapX + stepX; side = 0
    else sdy = sdy + ddy; mapY = mapY + stepY; side = 1 end
    local hitDist = (side == 0) and (sdx - ddx) or (sdy - ddy)
    if hitDist > 2.2 or mapX < 1 or mapY < 1 or mapX > sector.w or mapY > sector.h then break end
    local wCell = sector.grid[mapY][mapX]
    if wCell.kind == "wall" then
      local wallX = (side == 0) and (ent.y + hitDist * rdy) or (ent.x + hitDist * rdx)
      wallX = wallX - math.floor(wallX)
      local baseV = (ent.kind == "enemy_rat" or ent.spriteId == "enemy_rat_1") and 0.68 or 0.48
      local v = math.max(0.24, math.min(0.84, baseV + (math.random() - 0.5) * 0.18))
      pushDecalCapped(sector, {
        surface = "wall", kind = kind, tx = mapX, ty = mapY, side = side,
        u = wallX, v = v,
        radU = (isFatal and 0.19 or 0.13) + math.random() * 0.10,
        radV = (isFatal and 0.18 or 0.12) + math.random() * 0.09,
        seed = math.floor(math.random() * 1000),
      })
      break
    end
  end
end

function Physics.getEffectiveDebuffIntensity(deb)
  if not deb or (deb.timer or 0) <= 0 or (deb.intensity or 0) <= 0 then return 0 end
  local maxT = math.max(0.1, deb.maxTimer or 1.0)
  local decay = 0.32 + 0.68 * clampVal(deb.timer / maxT, 0, 1)
  return clampVal(deb.intensity * decay, 0, 1)
end

function Physics.applyPlayerDebuff(player, element, rawDamage, duration)
  if element ~= "thermal" and element ~= "cryo" and element ~= "shock" and element ~= "toxin" then
    return
  end
  player.debuffs = player.debuffs or {}
  local armorResist = player.armor and player.armor.resistElement
  local resistMult = (armorResist == element) and 0.38 or 1.0
  local bio = (player.attributes and player.attributes.bio) or 2
  local bioMult = (element == "thermal" or element == "toxin") and math.max(0.65, 1.0 - (bio - 2) * 0.05) or 1.0
  local effectiveDmg = (rawDamage or 0) * resistMult * bioMult
  local gain = clampVal(effectiveDmg / 18.0, 0.2, 1.0)

  for _, existing in ipairs(player.debuffs) do
    if existing.element == element then
      existing.intensity = math.min(1.0, math.max(existing.intensity * 0.72 + gain * 0.58, gain))
      existing.maxTimer = math.max(existing.maxTimer or duration, duration)
      existing.timer = duration
      return
    end
  end

  player.debuffs[#player.debuffs + 1] = {
    element = element,
    intensity = gain,
    timer = duration,
    maxTimer = duration,
  }
end

function Physics.hasLineOfSight(sector, x0, y0, x1, y1)
  local dist = math.sqrt((x1 - x0)^2 + (y1 - y0)^2)
  local steps = math.max(1, math.ceil(dist * 6))
  local dx, dy = (x1 - x0) / steps, (y1 - y0) / steps
  for i = 1, steps - 1 do
    local gx, gy = math.floor(x0 + dx * i), math.floor(y0 + dy * i)
    local cell = sector.grid[gy] and sector.grid[gy][gx]
    if not cell or cell.kind == "wall" then return false end
    if cell.kind == "cover" and (cell.coverHp or 0) > 0 then return false end
    if (cell.kind == "door" or cell.kind == "gate") and (cell.doorOpen or 0) < 0.7 then return false end
  end
  return true
end

local BARREL_BLAST_SPECS = {
  barrel_fuel  = { element = "thermal", hazard = "burning",   radius = 3.2, maxDmg = 30, entDmg = 55 },
  barrel_cryo  = { element = "cryo",    hazard = "frozen",    radius = 3.0, maxDmg = 22, entDmg = 38 },
  barrel_shock = { element = "shock",   hazard = "electrified", radius = 3.4, maxDmg = 28, entDmg = 45 },
}

function Physics.fireShot(state)
  Physics.cancelWeaponInspect(state.weaponMotion, "firing")
  local rdx, rdy = math.cos(state.angle), math.sin(state.angle)
  local bestEnt, bestDist = nil, 18.0
  for _, ent in ipairs(state.sector.entities) do
    if not ent.dead then
      local ex, ey = ent.x - state.px, ent.y - state.py
      local proj = ex * rdx + ey * rdy
      if proj > 0.2 and proj < bestDist then
        local perpSq = ex * ex + ey * ey - proj * proj
        if perpSq <= 0.18 then
          bestDist = proj
          bestEnt = ent
        end
      end
    end
  end
  state.recoil = 1.0
  state.muzzleFlash = 1.0
  local playerSplashes = {}

  if bestEnt then
    local wepElem = (state.player and state.player.activeWeapon and state.player.activeWeapon.element) or "kinetic"
    bestEnt.hp = bestEnt.hp - 22
    bestEnt.hostile = true
    if wepElem ~= "kinetic" then
      bestEnt.statusElement = wepElem
      bestEnt.statusTimer = 3.2
    end
    Physics.emitEntitySplatterDecals(state.sector, bestEnt, rdx, rdy, bestEnt.hp <= 0)
    if bestEnt.hp <= 0 then
      bestEnt.dead = true
      local spec = BARREL_BLAST_SPECS[bestEnt.kind]
      if spec then
        local bx, by = math.floor(bestEnt.x), math.floor(bestEnt.y)
        local bCell = state.sector.grid[by] and state.sector.grid[by][bx]
        if bCell and bCell.kind == "empty" then
          bCell.hazard = spec.hazard
          bCell.hazardTimer = 9.0
        end
        for _, other in ipairs(state.sector.entities) do
          if not other.dead and other ~= bestEnt then
            local od = math.sqrt((other.x - bestEnt.x)^2 + (other.y - bestEnt.y)^2)
            if od <= spec.radius then
              other.hp = other.hp - spec.entDmg * (1 - od / (spec.radius + 0.5))
              other.statusElement = spec.element
              other.statusTimer = 3.5
              if other.hp <= 0 then other.dead = true end
            end
          end
        end
        local pd = math.sqrt((state.px - bestEnt.x)^2 + (state.py - bestEnt.y)^2)
        if pd <= spec.radius then
          playerSplashes[#playerSplashes + 1] = {
            element = spec.element,
            damage = spec.maxDmg * (1 - pd / (spec.radius + 0.5)),
          }
        end
      end
    end
  end

  return playerSplashes
end

return Physics
`,
  },
  {
    path: 'src/rpg.lua',
    language: 'lua',
    summary: 'Character customization, dynamic crafting, faction reputation, and branching dialogue checks.',
    content: `-- Sector Zero: RPG Customization, Crafting, Factions & Branching Narrative
local RPG = {}

RPG.FACTIONS = {
  aegis     = { name = "Aegis Security",       rep = 0 },
  syndicate = { name = "Rust Syndicate",       rep = 0 },
  helix     = { name = "Helix Bio-Collective", rep = 0 },
}

RPG.RECIPES = {
  {
    id = "thermite_rifle",
    name = "Thermite Assault Rifle",
    element = "thermal",
    minTech = 2,
    cost = { scrap = 4, microchip = 2, bio_gel = 1 },
    damage = 28,
  },
  {
    id = "tesla_scattergun",
    name = "Tesla Scattergun",
    element = "shock",
    minTech = 3,
    cost = { scrap = 4, arc_coil = 3, microchip = 1 },
    damage = 16,
  },
}

function RPG.checkAttribute(player, attr, minVal)
  local val = player.attributes[attr] or 1
  if player.perk == "silver_tongue" and (attr == "neural" or attr == "tech") then
    val = val + 1
  end
  return val >= minVal
end

function RPG.shiftReputation(factions, factionId, delta, entities)
  local fac = factions[factionId]
  if not fac then return end
  fac.rep = math.max(-100, math.min(100, fac.rep + delta))

  -- Reactive world hostility: faction patrols become hostile below -20 rep
  for _, ent in ipairs(entities) do
    if ent.faction == factionId and ent.kind ~= "npc" then
      ent.hostile = fac.rep < -20
    end
  end
end

function RPG.craftItem(player, recipe)
  if player.attributes.tech < recipe.minTech then
    return false, "Requires Tech " .. recipe.minTech
  end
  for mat, need in pairs(recipe.cost) do
    if (player.materials[mat] or 0) < need then
      return false, "Missing " .. mat
    end
  end
  for mat, need in pairs(recipe.cost) do
    player.materials[mat] = player.materials[mat] - need
  end
  return true, recipe.name .. " assembled"
end

return RPG
`,
  },
  {
    path: 'main.lua',
    language: 'lua',
    summary: 'Main game loop integrating GLES 2.0 shaders, virtual dual-stick touch controls, and minimal HUD.',
    content: `-- Sector Zero: Main Entry Point (LuaJIT + LÖVE2D Android OpenGL ES 2.0)
local Atlas     = require("src.atlas")
local Raycaster = require("src.raycaster")
local Physics   = require("src.physics")
local RPG       = require("src.rpg")

local DASH_STAMINA_COST = 28
local DASH_DURATION = 0.18
local DASH_IFRAME_DURATION = 0.24
local DASH_COOLDOWN = 0.75
local DASH_SPEED = 10.8
local DOUBLE_TAP_WINDOW = 0.24

local atlas, shader, fbCanvas
local state = {
  px = 3.5, py = 10.5, angle = 0, pitch = 0, bob = 0, bobPhase = 0, lastStep = 0,
  lastRevealX = -1, lastRevealY = -1, showMap = false,
  recoil = 0, muzzleFlash = 0, damageFlash = 0, time = 0,
  hazardTick = 0, dotAcc = 0, outOfCombatTimer = 0,
  dashTimer = 0, dashIframeTimer = 0, dashCooldown = 0,
  dashDirX = 0, dashDirY = 0, dashFovOffset = 0,
  lastMoveTap = {},
  weaponMotion = Physics.createWeaponMotion(),
  player = {
    hp = 100, maxHp = 100, shield = 40, maxShield = 40, stamina = 100, maxStamina = 100,
    perk = "arc_conduit",
    armor = { defense = 10, resistElement = nil, speedMod = 1.0 },
    attributes = { ballistics = 4, tech = 3, bio = 2, neural = 3 },
    materials = { scrap = 5, microchip = 2, arc_coil = 2, bio_gel = 2 },
    activeWeapon = { name = "VX-9 Arc SMG", archetype = "smg", element = "shock", ammo = 28, mag = 28, sprite = "weapon_smg" },
    debuffs = {},
  },
  sector = {
    w = 12, h = 12,
    grid = {},
    decals = {},
    entities = {
      { x = 8.5, y = 6.5, kind = "enemy_droid", spriteId = "enemy_droid_1", hp = 75, maxHp = 75, hostile = true, attackCooldown = 0, scale = 1.0, statusElement = nil, statusTimer = 0, statusEmitAcc = 0 },
      { x = 5.2, y = 8.5, kind = "enemy_guard", spriteId = "enemy_guard_1", hp = 140, maxHp = 140, hostile = false, attackCooldown = 0, scale = 1.0, statusElement = nil, statusTimer = 0, statusEmitAcc = 0 },
      { x = 7.5, y = 4.5, kind = "barrel_fuel", spriteId = "prop_trash_can", hp = 25, maxHp = 25, hostile = false, attackCooldown = 0, scale = 0.85, statusElement = nil, statusTimer = 0, statusEmitAcc = 0 },
    },
  },
  particles = {},
}

local DEBUFF_THEME = {
  thermal = { label = "Thermal", color = { 0.96, 0.62, 0.04 }, vignette = { 0.94, 0.32, 0.12 } },
  cryo    = { label = "Cryo",    color = { 0.40, 0.88, 1.00 }, vignette = { 0.22, 0.74, 0.97 } },
  shock   = { label = "Shock",   color = { 0.38, 0.65, 0.98 }, vignette = { 0.23, 0.51, 0.96 } },
  toxin   = { label = "Toxin",   color = { 0.20, 0.83, 0.60 }, vignette = { 0.06, 0.73, 0.51 } },
}

local function applyDamageToPlayer(rawDmg, element, silentDot)
  if not silentDot and state.dashIframeTimer > 0 then
    return
  end
  if not silentDot then
    state.damageFlash = 1.0
  end
  state.outOfCombatTimer = 0
  local p = state.player
  local elMult = (element and element ~= "kinetic" and p.armor and p.armor.resistElement == element) and 0.45 or 1.0
  local def = (p.armor and p.armor.defense) or 0
  local mitigated = rawDmg * elMult * (1 - def / 100)
  if p.shield > 0 then
    local absorb = math.min(p.shield, mitigated)
    p.shield = p.shield - absorb
    p.hp = p.hp - (mitigated - absorb)
  else
    p.hp = p.hp - mitigated
  end
  if p.hp <= 0 then
    state.px = 3.5
    state.py = 10.5
    p.hp = math.floor(p.maxHp * 0.75)
    p.shield = p.maxShield
    p.debuffs = {}
    state.dotAcc = 0
    state.dashTimer = 0
    state.dashIframeTimer = 0
    state.dashCooldown = 0
  end
end

local function inflictPlayerDebuff(element, rawDmg, duration)
  if state.dashIframeTimer > 0 then
    return
  end
  Physics.applyPlayerDebuff(state.player, element, rawDmg, duration)
end

local function triggerTacticalDash(dirFwd, dirStrafe)
  if state.dashCooldown > 0 or state.dashTimer > 0 or state.player.stamina < DASH_STAMINA_COST then
    return
  end
  local fwd, strafe = dirFwd or 0, dirStrafe or 0
  if dirFwd == nil and dirStrafe == nil then
    if love.keyboard.isDown("w") then fwd = fwd + 1 end
    if love.keyboard.isDown("s") then fwd = fwd - 1 end
    if love.keyboard.isDown("q") then strafe = strafe - 1 end
    if love.keyboard.isDown("e") then strafe = strafe + 1 end
    if math.sqrt(fwd * fwd + strafe * strafe) < 0.1 then
      fwd, strafe = 1, 0
    end
  end
  local len = math.max(0.001, math.sqrt(fwd * fwd + strafe * strafe))
  local nfwd, nstrafe = fwd / len, strafe / len
  local cosA, sinA = math.cos(state.angle), math.sin(state.angle)

  state.dashDirX = cosA * nfwd - sinA * nstrafe
  state.dashDirY = sinA * nfwd + cosA * nstrafe
  state.player.stamina = math.max(0, state.player.stamina - DASH_STAMINA_COST)
  state.dashTimer = DASH_DURATION
  state.dashIframeTimer = DASH_IFRAME_DURATION
  state.dashCooldown = DASH_COOLDOWN

  Physics.triggerWeaponDash(state.weaponMotion, nstrafe, nfwd)
  local gx, gy = math.floor(state.px), math.floor(state.py)
  local cell = state.sector.grid[gy] and state.sector.grid[gy][gx]
  Physics.emitFootstepParticles(state.particles, state.px, state.py, state.angle, cell, true, 1)
end

local function firePlayerWeapon()
  local splashes = Physics.fireShot(state)
  if splashes then
    for _, sp in ipairs(splashes) do
      if sp.damage > 0.5 then
        applyDamageToPlayer(sp.damage, sp.element, false)
        inflictPlayerDebuff(sp.element, sp.damage, 3.8)
      end
    end
  end
end

local function initDemoSector()
  state.sector.decals = {}
  for y = 1, state.sector.h do
    state.sector.grid[y] = {}
    for x = 1, state.sector.w do
      local border = (x == 1 or y == 1 or x == state.sector.w or y == state.sector.h)
      if border then
        state.sector.grid[y][x] = { kind = "wall", wallTex = "wall_concrete_clean", visited = false }
      elseif (x == 6 and (y == 5 or y == 6)) then
        state.sector.grid[y][x] = { kind = "cover", wallTex = "wall_brick_gray", coverHp = 60, coverMaxHp = 60, coverHeight = 0.65, coverVisualScale = 1.0, coverShake = 0, destructible = true, visited = false }
      else
        state.sector.grid[y][x] = { kind = "empty", hazard = (x == 7 and y == 6) and "coolant" or "none", visited = false }
      end
    end
  end
  Physics.revealFogOfWar(state.sector, state.px, state.py, 3)
  state.lastRevealX = math.floor(state.px)
  state.lastRevealY = math.floor(state.py)
end

function love.load()
  atlas = Atlas.load("assets/spritesheet.jpg")
  shader = love.graphics.newShader("shaders/gles2_raycast.glsl")
  local rw, rh = Raycaster.getSize()
  fbCanvas = love.graphics.newCanvas(rw, rh)
  fbCanvas:setFilter("nearest", "nearest")
  initDemoSector()
end

function love.mousepressed(_, _, btn)
  if btn == 1 then
    firePlayerWeapon()
  end
end

function love.touchpressed(_, tx, ty)
  local sw, sh = love.graphics.getDimensions()
  if tx >= sw - 96 and tx <= sw - 20 and ty >= sh - 108 and ty <= sh - 64 then
    triggerTacticalDash()
  end
end

function love.keypressed(key, _, isrepeat)
  if isrepeat then return end
  if key == "tab" then
    state.showMap = not state.showMap
    if state.showMap then
      Physics.revealFogOfWar(state.sector, state.px, state.py, 3)
    end
  elseif key == "i" then
    Physics.triggerWeaponInspect(state.weaponMotion)
  elseif key == "r" then
    Physics.cancelWeaponInspect(state.weaponMotion, "reloading")
    state.weaponMotion.reloadTimer = 0.65
    state.player.activeWeapon.ammo = state.player.activeWeapon.mag
  elseif key == "space" then
    triggerTacticalDash()
  elseif key == "w" or key == "s" or key == "q" or key == "e" then
    local now = love.timer.getTime()
    local prev = state.lastMoveTap[key] or 0
    if (now - prev) <= DOUBLE_TAP_WINDOW then
      state.lastMoveTap[key] = 0
      if key == "w" then triggerTacticalDash(1, 0)
      elseif key == "s" then triggerTacticalDash(-1, 0)
      elseif key == "q" then triggerTacticalDash(0, -1)
      elseif key == "e" then triggerTacticalDash(0, 1) end
    else
      state.lastMoveTap[key] = now
    end
  end
end

function love.mousemoved(_, _, dx, dy)
  state.angle = state.angle + dx * 0.0024
  state.pitch = math.max(-0.28, math.min(0.28, state.pitch - dy * 0.0014))
  state.weaponMotion.lookVelX = state.weaponMotion.lookVelX + dx * 0.35
  state.weaponMotion.lookVelY = state.weaponMotion.lookVelY + dy * 0.25
end

function love.update(dt)
  state.time = state.time + dt
  state.recoil = math.max(0, state.recoil - dt * 6)
  state.muzzleFlash = math.max(0, state.muzzleFlash - dt * 8)
  state.damageFlash = math.max(0, state.damageFlash - dt * 3)

  Physics.stepCoverAnimations(state.sector.grid, dt)

  for _, ent in ipairs(state.sector.entities) do
    if not ent.dead then
      if (ent.statusTimer or 0) > 0 and ent.statusElement then
        ent.statusTimer = math.max(0, ent.statusTimer - dt)
        ent.statusEmitAcc = (ent.statusEmitAcc or 0) + dt
        local rate = (ent.statusElement == "shock") and 0.07 or ((ent.statusElement == "thermal") and 0.09 or 0.11)
        if ent.statusEmitAcc >= rate then
          ent.statusEmitAcc = 0
          Physics.emitStatusParticles(state.particles, ent)
        end
        if ent.statusElement == "thermal" or ent.statusElement == "toxin" then
          ent.hp = ent.hp - dt * 6
          if ent.hp <= 0 then ent.dead = true end
        end
        if ent.statusTimer == 0 then ent.statusElement = nil; ent.statusEmitAcc = 0 end
      end

      if not ent.dead and ent.hostile then
        ent.attackCooldown = math.max(0, (ent.attackCooldown or 0) - dt)
        local edx, edy = state.px - ent.x, state.py - ent.y
        local edist = math.sqrt(edx * edx + edy * edy)
        local atkRange = (ent.kind == "enemy_rat") and 1.25 or 8.5
        if edist <= atkRange and ent.attackCooldown <= 0 and Physics.hasLineOfSight(state.sector, ent.x, ent.y, state.px, state.py) then
          ent.attackCooldown = (ent.kind == "enemy_rat") and 1.0 or 1.45
          local rawDmg = (ent.kind == "enemy_droid") and 14 or ((ent.kind == "enemy_rat") and 8 or 11)
          local atkEl = (ent.statusElement and ent.statusElement ~= "kinetic" and (ent.statusTimer or 0) > 0)
            and ent.statusElement
            or ((ent.kind == "enemy_droid") and "shock" or ((ent.kind == "enemy_rat") and "toxin" or "kinetic"))
          applyDamageToPlayer(rawDmg, atkEl, false)
          if atkEl ~= "kinetic" then
            inflictPlayerDebuff(atkEl, rawDmg, (atkEl == "toxin") and 3.4 or 2.8)
          end
        end
      end
    end
  end

  Physics.stepParticles(state.particles, dt)

  -- Active elemental debuff decay & tactical modifiers (cryo slow, shock stamina drag, thermal/toxin DoT)
  local cryoEff, shockEff, thermalEff, toxinEff = 0, 0, 0, 0
  local debuffs = state.player.debuffs
  for i = #debuffs, 1, -1 do
    local deb = debuffs[i]
    deb.timer = deb.timer - dt
    if deb.timer <= 0 then
      table.remove(debuffs, i)
    else
      local eff = Physics.getEffectiveDebuffIntensity(deb)
      if deb.element == "cryo" then cryoEff = math.max(cryoEff, eff)
      elseif deb.element == "shock" then shockEff = math.max(shockEff, eff)
      elseif deb.element == "thermal" then thermalEff = math.max(thermalEff, eff)
      elseif deb.element == "toxin" then toxinEff = math.max(toxinEff, eff) end
    end
  end

  if thermalEff > 0 or toxinEff > 0 then
    state.dotAcc = state.dotAcc + (thermalEff * 4.8 + toxinEff * 3.6) * dt
    if state.dotAcc >= 0.85 then
      local dotAmt = state.dotAcc
      state.dotAcc = 0
      applyDamageToPlayer(dotAmt, (thermalEff >= toxinEff) and "thermal" or "toxin", true)
    end
  else
    state.dotAcc = 0
  end

  -- Floor hazard exposure & elemental debuff buildup
  state.hazardTick = state.hazardTick + dt
  if state.hazardTick >= 0.6 then
    state.hazardTick = 0
    local gx, gy = math.floor(state.px), math.floor(state.py)
    local hCell = state.sector.grid[gy] and state.sector.grid[gy][gx]
    if hCell then
      if hCell.hazard == "burning" then
        applyDamageToPlayer(7, "thermal", false)
        inflictPlayerDebuff("thermal", 7, 3.2)
      elseif hCell.hazard == "electrified" then
        applyDamageToPlayer(8, "shock", false)
        inflictPlayerDebuff("shock", 8, 2.6)
      elseif hCell.hazard == "toxic" then
        applyDamageToPlayer(5, "toxin", false)
        inflictPlayerDebuff("toxin", 5, 3.6)
      elseif hCell.hazard == "frozen" then
        applyDamageToPlayer(2.5, "cryo", false)
        inflictPlayerDebuff("cryo", 6, 3.0)
      elseif hCell.hazard == "coolant" then
        inflictPlayerDebuff("cryo", 3.6, 2.2)
      end
    end
  end

  local moveFwd, moveStrafe, turnDelta = 0, 0, 0
  if love.keyboard.isDown("w") then moveFwd = moveFwd + 1 end
  if love.keyboard.isDown("s") then moveFwd = moveFwd - 1 end
  if love.keyboard.isDown("q") then moveStrafe = moveStrafe - 1 end
  if love.keyboard.isDown("e") then moveStrafe = moveStrafe + 1 end
  if love.keyboard.isDown("a") then
    state.angle = state.angle - 2.2 * dt
    turnDelta = turnDelta - 2.2 * dt * 115
  end
  if love.keyboard.isDown("d") then
    state.angle = state.angle + 2.2 * dt
    turnDelta = turnDelta + 2.2 * dt * 115
  end

  state.dashTimer = math.max(0, state.dashTimer - dt)
  state.dashIframeTimer = math.max(0, state.dashIframeTimer - dt)
  state.dashCooldown = math.max(0, state.dashCooldown - dt)

  local isDashing = state.dashTimer > 0
  local targetFov = isDashing and 0.068 or 0
  state.dashFovOffset = state.dashFovOffset + (targetFov - state.dashFovOffset) * (1 - math.exp(-18 * dt))
  if not isDashing and math.abs(state.dashFovOffset) < 0.0005 then
    state.dashFovOffset = 0
  end

  local wantsMove = (math.abs(moveFwd) + math.abs(moveStrafe)) > 0.05
  local wantsSprint = love.keyboard.isDown("lshift") or love.keyboard.isDown("rshift")
  local isSprinting = (not isDashing) and wantsMove and wantsSprint and state.player.stamina > 2
  if isSprinting then
    state.player.stamina = math.max(0, state.player.stamina - 26 * dt)
  elseif not isDashing then
    local shockRegenMult = 1 - shockEff * 0.45
    state.player.stamina = math.min(state.player.maxStamina, state.player.stamina + 18 * shockRegenMult * dt)
  end

  local cryoSlowMult = 1 - cryoEff * 0.28
  local speed = 3.6 * (isSprinting and 1.52 or 1.0) * cryoSlowMult * dt
  local dx, dy = math.cos(state.angle), math.sin(state.angle)
  local vx = isDashing and (state.dashDirX * DASH_SPEED * cryoSlowMult * dt) or ((dx * moveFwd - dy * moveStrafe) * speed)
  local vy = isDashing and (state.dashDirY * DASH_SPEED * cryoSlowMult * dt) or ((dy * moveFwd + dx * moveStrafe) * speed)
  local oldX, oldY = state.px, state.py
  if Physics.canStep(state.sector, state.px + vx, state.py) then state.px = state.px + vx end
  if Physics.canStep(state.sector, state.px, state.py + vy) then state.py = state.py + vy end

  -- Android dual-stick touch input polling
  for _, id in ipairs(love.touch.getTouches()) do
    local tx, ty = love.touch.getPosition(id)
    local sw, sh = love.graphics.getDimensions()
    if tx < sw * 0.45 then
      local touchStep = dx * ((sh * 0.72 - ty) / 140) * speed
      local touchStepY = dy * ((sh * 0.72 - ty) / 140) * speed
      if Physics.canStep(state.sector, state.px + touchStep, state.py) then state.px = state.px + touchStep end
      if Physics.canStep(state.sector, state.px, state.py + touchStepY) then state.py = state.py + touchStepY end
    elseif tx > sw * 0.55 and not (tx >= sw - 96 and ty >= sh - 108 and ty <= sh - 64) then
      local tYaw = ((tx - sw * 0.8) / 120) * dt * 2.0
      state.angle = state.angle + tYaw
      turnDelta = turnDelta + tYaw * 115
    end
  end
  state.weaponMotion.lookVelX = state.weaponMotion.lookVelX + turnDelta

  local tileX, tileY = math.floor(state.px), math.floor(state.py)
  if tileX ~= state.lastRevealX or tileY ~= state.lastRevealY then
    state.lastRevealX, state.lastRevealY = tileX, tileY
    Physics.revealFogOfWar(state.sector, state.px, state.py, 3)
  end

  local isMoving = (not isDashing) and (math.abs(state.px - oldX) + math.abs(state.py - oldY) > 0.001)
  if isMoving then
    state.bobPhase = state.bobPhase + dt * (isSprinting and 16.5 or 10.5)
    state.bob = math.sin(state.bobPhase) * (isSprinting and 4.8 or 3.2)
    local stepIdx = math.floor(state.bobPhase / math.pi)
    if stepIdx ~= state.lastStep then
      state.lastStep = stepIdx
      local gx, gy = math.floor(state.px), math.floor(state.py)
      local cell = state.sector.grid[gy] and state.sector.grid[gy][gx]
      Physics.emitFootstepParticles(state.particles, state.px, state.py, state.angle, cell, isSprinting, (stepIdx % 2 == 0) and 1 or -1)
    end
  end

  Physics.stepWeaponMotion(state.weaponMotion, {
    archetype = state.player.activeWeapon.archetype,
    time = state.time,
    bobPhase = state.bobPhase,
    moveStrafe = moveStrafe,
    isMoving = isMoving,
    isSprinting = isSprinting,
    recoil = state.recoil,
  }, dt)
end

function love.draw()
  local rw, rh = Raycaster.getSize()
  love.graphics.setCanvas(fbCanvas)
  love.graphics.clear()
  Raycaster.render(state, atlas)
  love.graphics.setCanvas()

  local activeDebuffs = {}
  for _, deb in ipairs(state.player.debuffs) do
    local eff = Physics.getEffectiveDebuffIntensity(deb)
    if eff > 0.02 then
      activeDebuffs[#activeDebuffs + 1] = { deb = deb, eff = eff }
    end
  end
  table.sort(activeDebuffs, function(a, b) return a.eff > b.eff end)
  local dominant = activeDebuffs[1]
  local debColor = dominant and DEBUFF_THEME[dominant.deb.element].vignette or { 0, 0, 0 }
  local debIntensity = dominant and dominant.eff or 0.0

  -- Present via OpenGL ES 2.0 mediump shader
  love.graphics.setShader(shader)
  shader:send("u_muzzleFlash", state.muzzleFlash)
  shader:send("u_damageFlash", state.damageFlash)
  shader:send("u_lowHp", (state.player.hp < 35) and 1.0 or 0.0)
  shader:send("u_elementTint", { 0.4, 0.8, 1.0 })
  shader:send("u_debuffColor", debColor)
  shader:send("u_debuffIntensity", debIntensity)
  shader:send("u_dashIframe", math.min(1.0, state.dashIframeTimer / 0.16))
  shader:send("u_time", state.time)

  local sw, sh = love.graphics.getDimensions()
  love.graphics.draw(fbCanvas, 0, 0, 0, sw / rw, sh / rh)
  love.graphics.setShader()

  -- Active Elemental Debuff Readout anchored above Vitality bar (unboxed, intensity-scaled)
  for idx, entry in ipairs(activeDebuffs) do
    local theme = DEBUFF_THEME[entry.deb.element]
    local rowY = sh - 56 - (idx - 1) * 18
    local pct = math.floor(entry.eff * 100 + 0.5)
    love.graphics.setColor(theme.color[1], theme.color[2], theme.color[3], 0.95)
    love.graphics.print(string.format("%s  %d%% · %.1fs", theme.label, pct, entry.deb.timer), 20, rowY - 12)
    love.graphics.setColor(0.12, 0.16, 0.22, 0.75)
    love.graphics.rectangle("fill", 20, rowY + 3, 160, 2)
    love.graphics.setColor(theme.color[1], theme.color[2], theme.color[3], 0.95)
    love.graphics.rectangle("fill", 20, rowY + 3, 160 * entry.eff, 2)
  end

  -- Minimal Diegetic Edge HUD (Vitality, Shield, Stamina & Tactical Dash)
  love.graphics.setColor(0.94, 0.27, 0.27, 0.9)
  love.graphics.rectangle("fill", 20, sh - 38, 160 * (state.player.hp / state.player.maxHp), 3)
  love.graphics.setColor(0.02, 0.71, 0.83, 0.9)
  love.graphics.rectangle("fill", 20, sh - 31, 160 * (state.player.shield / state.player.maxShield), 2)
  love.graphics.setColor(0.96, 0.62, 0.04, 0.85)
  love.graphics.rectangle("fill", 20, sh - 25, 160 * (state.player.stamina / state.player.maxStamina), 1.5)

  local isCooling = state.dashCooldown > 0.02
  local isEvading = state.dashIframeTimer > 0
  local hasStamina = state.player.stamina >= DASH_STAMINA_COST
  local dashRatio = isCooling and math.max(0, math.min(1, (DASH_COOLDOWN - state.dashCooldown) / DASH_COOLDOWN)) or 1
  local dashLabel = isEvading and "Dash  Evade" or (isCooling and string.format("Dash  %.1fs", state.dashCooldown) or (hasStamina and "Dash  Ready" or "Dash  Low Stam"))
  love.graphics.setColor(isEvading and 0.40 or 0.78, isEvading and 0.93 or 0.84, isEvading and 1.00 or 0.92, 0.92)
  love.graphics.print(dashLabel, 20, sh - 21)
  love.graphics.setColor(0.12, 0.16, 0.22, 0.75)
  love.graphics.rectangle("fill", 20, sh - 7, 160, 2)
  if hasStamina or isCooling or isEvading then
    love.graphics.setColor(0.13, 0.83, 0.93, isCooling and 0.75 or 0.95)
  else
    love.graphics.setColor(0.96, 0.62, 0.04, 0.45)
  end
  love.graphics.rectangle("fill", 20, sh - 7, 160 * dashRatio, 2)

  -- Android touch Dash button
  local osName = love.system and love.system.getOS and love.system.getOS() or ""
  if osName == "Android" or osName == "iOS" or #love.touch.getTouches() > 0 then
    love.graphics.setColor(0.02, 0.35, 0.45, (not isCooling and hasStamina) and 0.75 or 0.35)
    love.graphics.rectangle("fill", sw - 96, sh - 108, 76, 44, 8, 8)
    love.graphics.setColor(0.13, 0.83, 0.93, 0.9)
    love.graphics.rectangle("line", sw - 96, sh - 108, 76, 44, 8, 8)
    love.graphics.setColor(0.85, 0.98, 1.0, 0.95)
    love.graphics.print(isCooling and string.format("%.1fs", state.dashCooldown) or "DASH", sw - 74, sh - 92)
  end

  love.graphics.setColor(1, 1, 1, 0.9)
  love.graphics.print(state.player.activeWeapon.name .. "  " .. state.player.activeWeapon.ammo, sw - 210, sh - 28)

  -- Tab Tactical Sector Map Overlay with Fog-of-War
  if state.showMap then
    local cellPx = 12
    local pad = 14
    local mapW = state.sector.w * cellPx
    local mapH = state.sector.h * cellPx
    local ox = sw - mapW - pad - 18
    local oy = 24
    love.graphics.setColor(0.05, 0.06, 0.09, 0.90)
    love.graphics.rectangle("fill", ox - pad, oy - pad, mapW + pad * 2, mapH + pad * 2 + 26, 6, 6)
    love.graphics.setColor(1, 1, 1, 0.14)
    love.graphics.rectangle("line", ox - pad, oy - pad, mapW + pad * 2, mapH + pad * 2 + 26, 6, 6)

    local visitedCount = 0
    local totalCount = state.sector.w * state.sector.h
    local pxTile, pyTile = math.floor(state.px), math.floor(state.py)

    for gy = 1, state.sector.h do
      for gx = 1, state.sector.w do
        local cell = state.sector.grid[gy][gx]
        local isPlayer = (gx == pxTile and gy == pyTile)
        if cell.visited then visitedCount = visitedCount + 1 end
        local isRevealed = cell.visited or isPlayer

        if not isRevealed then
          local shade = ((gx + gy) % 2 == 0) and 0.04 or 0.06
          love.graphics.setColor(shade, shade + 0.01, shade + 0.03, 1)
        elseif isPlayer then
          love.graphics.setColor(1, 1, 1, 1)
        elseif cell.kind == "wall" then
          love.graphics.setColor(0.28, 0.33, 0.41, 1)
        elseif cell.kind == "cover" then
          love.graphics.setColor(0.85, 0.47, 0.02, 1)
        elseif cell.kind == "door" or cell.kind == "gate" then
          love.graphics.setColor(0.02, 0.71, 0.83, 1)
        elseif cell.hazard == "coolant" or cell.hazard == "electrified" then
          love.graphics.setColor(0.05, 0.45, 0.56, 1)
        elseif cell.hazard == "oil" or cell.hazard == "burning" then
          love.graphics.setColor(0.60, 0.20, 0.07, 1)
        else
          love.graphics.setColor(0.10, 0.13, 0.19, 1)
        end

        love.graphics.rectangle("fill", ox + (gx - 1) * cellPx, oy + (gy - 1) * cellPx, cellPx - 1, cellPx - 1)
      end
    end

    local pct = math.floor((visitedCount / math.max(1, totalCount)) * 100 + 0.5)
    love.graphics.setColor(0.82, 0.86, 0.92, 0.95)
    love.graphics.print(string.format("Explored %d%% (%d/%d)", pct, visitedCount, totalCount), ox, oy + mapH + 6)
    love.graphics.setColor(1, 1, 1, 1)
  end
end
`,
  },
  {
    path: 'README.md',
    language: 'markdown',
    summary: 'Instructions for running Sector Zero in LÖVE2D and packaging an OpenGL ES 2.0 Android APK.',
    content: `# Sector Zero — LuaJIT + OpenGL ES 2.0 Android Build

## Architecture Overview
- **Runtime**: LuaJIT + LÖVE2D 11.4+ (OpenGL ES 2.0 profile)
- **Target GPUs**: Legacy Android smartphones (Adreno 305, Mali-400 MP4, PowerVR SGX)
- **Rendering**: 480x270 virtual framebuffer raycaster + batched Z-buffered sprite billboards + \`mediump\` GLSL ES shader pass
- **Sprite Sheet**: Uses \`assets/spritesheet.jpg\` (1408x768) with automatic edge-seeded flood-fill transparency keying

## Running on Desktop
1. Install [LÖVE2D 11.4+](https://love2d.org).
2. Extract this archive and run:
   \`\`\`bash
   love .
   \`\`\`

## Packaging for Older Android Smartphones (OpenGL ES 2.0)
1. Zip the contents of this folder (with \`main.lua\` at the root) into \`game.love\`.
2. Clone \`love-android\` (SDL2 + LuaJIT + GLES 2.0) and place \`game.love\` in \`app/src/main/assets/game.love\`.
3. Build the APK via Gradle:
   \`\`\`bash
   ./gradlew assembleEmbedRelease
   \`\`\`
4. Install on any Android 5.0+ device via \`adb install\`.
`,
  },
];
