struct Params {
  view_w: f32,
  view_h: f32,
  sim_w: f32,
  sim_h: f32,
  delta_t : f32,
  g : f32,
  n : f32,
  drag : f32,
  fluff : f32,
}

struct Particle {
  position : vec2<f32>,
  velocity : vec2<f32>,
  mass : f32,
  radius : f32,
}

struct Particles {
  particles: array<Particle>
}

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage> curr_data : Particles;

struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32
}

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) quad_pos: vec2<f32>,
  @location(1) particle_pos: vec2<f32>,
  @location(2) mass : f32,
}

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var particle = curr_data.particles[in.instance];
  particle.position = particle.position / vec2f(params.sim_w, params.sim_h) * 2;
  let position = particle.position.xy + in.pos.xy / vec2f(params.view_w, params.view_h) * particle.radius;

  var out : VertexOutput;
  out.position = vec4(position, 0, 1);
  out.quad_pos = in.pos;
  out.mass = particle.mass;
  out.particle_pos = particle.position;
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  let dist_to_universe_center = length(in.particle_pos);
  let dist_to_particle_center = length(in.quad_pos);
  let alpha = 2 * max(.5 - pow(dist_to_particle_center, 2), 0);
  // Map the distance to the color gradient
  let color = mix(vec4f(63.0 / 255.0, 94.0 / 255.0, 251.0 / 255.0, alpha),
                  vec4f(252.0 / 255.0, 70.0 / 255.0, 107.0 / 255.0, alpha),
                  saturate(dist_to_universe_center / 0.5)); // 0.5 is the radius of the circle

  return color;
}