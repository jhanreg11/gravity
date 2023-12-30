const renderRes = await fetch('./render.wgsl');
const renderShaders = await renderRes.text();
const simRes = await fetch('./simulate.wgsl');
const computeShaders = await simRes.text();

const WORKGROUP_SIZE = 8;

const canvas = document.querySelector("canvas");
canvas.style.width = "100vw";
canvas.style.height = "100vh";
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}
const device = await adapter.requestDevice();
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format
});

const paramOrder = [
  'view_w',
  'view_h',
  'sim_w',
  'sim_h',
  'delta_t',
  'g',
  'n',
  'drag',
  'fluff'
];
const params = {
  // render
  view_w: canvas.offsetWidth,
  view_h: canvas.offsetHeight,
  // sim
  sim_w: canvas.offsetWidth,
  sim_h: canvas.offsetHeight,
  delta_t: .05,
  g: 1000, // real value: 6.673e-11
  drag: 0.00,
  n: 3200,
  fluff: 1/.1,
};
const paramsBuffer = device.createBuffer({
  size: 4 * Object.keys(params).length,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  label: 'shared params'
});
device.queue.writeBuffer(
  paramsBuffer,
  0,
  new Float32Array(paramOrder.map(k => params[k]))
);

const vertexData = new Float32Array([
  //   X,    Y,
    -0.8, -0.8, // Triangle 1 (Blue)
     0.8, -0.8,
     0.8,  0.8,
  
    -0.8, -0.8, // Triangle 2 (Red)
     0.8,  0.8,
    -0.8,  0.8,
  ]);
const quadVertexBuffer = device.createBuffer({
  size: vertexData.byteLength, // 6x vec2<f32>
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  label: 'dot verts'
});
device.queue.writeBuffer(quadVertexBuffer, 0, vertexData);

function randPointInCircle(radius) {
  const cosYA = 1 - 2 * Math.random()
  const sinYA = Math.sqrt(1 - cosYA * cosYA)
  const xa = 2 * Math.PI * Math.random()
  const r = radius * (Math.random() ** (1 / 100))
  const ry = r * sinYA
  const x = ry * Math.cos(xa)
  const y = r * (cosYA)
  const z = ry * Math.sin(xa)
  return [x, y];
}
const PARTICLE_BYTES = 
  2 * 4 + // position
  2 * 4 + // velocity
  1 * 4 + // mass
  1 * 4 + // radius
  0;
const particlesBuffers = [0, 1].map(idx => device.createBuffer({
  size: params.n * PARTICLE_BYTES,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  label: `particles ${idx}`
}));
const particlesData = new Float32Array(params.n * PARTICLE_BYTES / 4);
device.queue.writeBuffer(particlesBuffers[1], 0, particlesData);
for (let i = 0; i < params.n; i++) {
  let offset = i * PARTICLE_BYTES / 4;
  let sim_r = Math.min(params.sim_h, params.sim_w) / 2;
  // random pos in circle
  const [x, y] = randPointInCircle(sim_r);
  particlesData[offset] = x;
  particlesData[offset + 1] = y;

  let m = ((Math.random() ** 16) * .999 + .001);

  // vel
  const [vx, vy] = randPointInCircle(.001 / m);
  particlesData[offset + 2] = vx;
  particlesData[offset + 3] = vy;
  
  // mass
  particlesData[offset + 4] = m * 100;
  //radius
  particlesData[offset + 5] = m ** (1 / 3) * 10; 
}
device.queue.writeBuffer(particlesBuffers[0], 0, particlesData);

const sharedLayout = device.createBindGroupLayout({
  label: 'Shared Bind Group Layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: {} // shared uniforms
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      buffer: { type: "read-only-storage" } // Cell state input buffer
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" } // Cell state output buffer
    },
  ]
});

const pipelineLayout = device.createPipelineLayout({
  label: "shared pipeline layout",
  bindGroupLayouts: [ sharedLayout ]
});

const renderPipeline = device.createRenderPipeline({
  label: 'Render Pipeline',
  layout: pipelineLayout,
  vertex: {
    module: device.createShaderModule({
      code: renderShaders,
    }),
    entryPoint: 'vs_main',
    buffers: [
      {
        // quad vertex buffer
        arrayStride: 2 * 4, // vec2<f32>
        stepMode: 'vertex',
        attributes: [
          {
            // vertex positions
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
          },
        ],
      },
    ],
  },
  fragment: {
    module: device.createShaderModule({
      code: renderShaders,
    }),
    entryPoint: 'fs_main',
    targets: [
      {
        format: format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'zero',
            dstFactor: 'one',
            operation: 'add',
          },
        },
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});
const computePipeline = device.createComputePipeline({
  label: 'Compute Pipeline',
  layout: pipelineLayout,
  compute: {
    module: device.createShaderModule({
      code: computeShaders,
    }),
    entryPoint: 'simulate_step',
  },
});

const bindGroups = [[0, 1], [1, 0]].map(particlesOrder => device.createBindGroup({
  label: `Bind Group ${particlesOrder[0]}`,
  layout: sharedLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: paramsBuffer }
    },
    ...particlesOrder.map((particlesI, idx) => ({
      binding: idx + 1,
      resource: { buffer: particlesBuffers[particlesI]}
    })),
  ]
}));

function writeStats(timeDiffMs, iter) {
  document.getElementById('FPS').innerHTML = Math.round(1 / timeDiffMs * 1000);
  document.getElementById('ITER').innerHTML = iter
}

let last = performance.now();
let iter = 0;
function frame() {
  const commandEncoder = device.createCommandEncoder();
  {
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroups[iter % 2]);
    const nWorkgroups = Math.ceil(params.n / WORKGROUP_SIZE);
    passEncoder.dispatchWorkgroups(nWorkgroups, 1, 1);
    passEncoder.end();
  }
  iter++;
  {
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(), 
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          storeOp: 'store',
        },
      ],
    });
    passEncoder.setPipeline(renderPipeline);
    passEncoder.setVertexBuffer(0, quadVertexBuffer);
    passEncoder.setBindGroup(0, bindGroups[iter % 2]);
    passEncoder.draw(vertexData.length / 2, params.n);
    passEncoder.end();
  }

  device.queue.submit([commandEncoder.finish()]);
  const curr = performance.now();
  writeStats(curr - last, iter);
  last = curr;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);