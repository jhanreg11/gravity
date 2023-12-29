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
  @location(0) particle_position: vec2<f32>,
}

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var particle = curr_data.particles[in.instance];
  particle.position = particle.position / vec2f(params.sim_w, params.sim_h) * 2;
  let position = particle.position.xy + in.pos.xy / vec2f(params.view_w, params.view_h) * particle.radius;

  var out : VertexOutput;
  out.position = vec4(position, 0, 1);
  out.particle_position = particle.position.xy;
  return out;
}


// FRAGMENT
@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  // let c = (in.particle_position.xy + 1) / 2;
  // return vec4f(c, 1.0 - c.y, 1.0); 
  return vec4f(1.0, 1.0, 1.0, 1.0);
}