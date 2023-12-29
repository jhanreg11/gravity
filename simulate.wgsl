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
@binding(2) @group(0) var<storage, read_write> next_data : Particles;

@compute @workgroup_size(8)
fn simulate_step(@builtin(global_invocation_id) global_invocation_id: vec3<u32>) {
  let idx = global_invocation_id.x;
  if (f32(idx) >= params.n) {
    return;
  }

  var particle = curr_data.particles[idx];
  if (particle.mass <= 0 || particle.radius <= 0) {
    return;
  }

  var accel = vec2f(0); // -params.drag * particle.velocity / particle.mass;
  for (var i: u32 = 0; f32(i) < params.n; i=i+1) {
    if (i != idx) {
      let other = curr_data.particles[i];
      let dist_vec = other.position - particle.position;
      let safe_dist = other.radius * params.fluff + length(dist_vec);
      let proximity = 1.0 / safe_dist;
      let dirn = dist_vec * proximity;
      let accel_from_other = (params.g * proximity) * (other.mass * proximity);
      accel = accel + accel_from_other * dirn;
    }
  }

  let delta_v = accel * params.delta_t;
  let delta_p = (.5 * delta_v + particle.velocity) * params.delta_t;
  particle.velocity = particle.velocity + delta_v;
  particle.position = particle.position + delta_p;

  // if (abs(particle.position.x) >= params.sim_w / 2) {
  //   particle.velocity.x = 0;
  //   // particle.velocity.x = -particle.velocity.x;
  // }
  // if (abs(particle.position.y) >= params.sim_h / 2) {
  //   particle.velocity.y = 0;
  //   // particle.velocity.y = -particle.velocity.y;
  // }

  next_data.particles[idx] = particle;
}
