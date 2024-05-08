import { mat4x4 } from '../math/mat4x4.js';
import { vec3 } from '../math/vec3.js';

function deg2rad(degree) {
    return degree * Math.PI / 180;
}

const culling = document.getElementById('culling');
const frontface = document.getElementById('frontface');
const depth = document.getElementById('depth');

const swapchainFormat = navigator.gpu.getPreferredCanvasFormat();
const sampleCount = 4;
const depthFormat = 'depth32float';
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.getElementById('canvas');
const context = canvas.getContext('webgpu');
context.configure({
    device: device,
    format: swapchainFormat
});

const shaderCode = `
@group(0) @binding(0) var<uniform> wvp : mat4x4<f32>;

struct VSOut {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec4<f32>,
};

@vertex
fn VS(@location(0) position : vec3<f32>, @location(1) color : vec4<f32>) -> VSOut {
    var out : VSOut;
    out.position = vec4<f32>(position, 1.0) * wvp;
    out.color = color;

    return out;
}

@fragment
fn FS(@location(0) color : vec4<f32>) -> @location(0) vec4<f32> {
    return color;
}`;

const shaderModule = device.createShaderModule({
    code: shaderCode
});
console.log(await shaderModule.getCompilationInfo());

const depthTexture = device.createTexture({
    size: [ canvas.width, canvas.height ],
    format: depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    sampleCount: sampleCount,
});
const depthTextureView = depthTexture.createView();

const msaaTexture = device.createTexture({
    size: [ canvas.width, canvas.height ],
    format: swapchainFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
    sampleCount: sampleCount,
});
const msaaTextureView = msaaTexture.createView();

const positions = new Float32Array([
     0,  1, 0,
     1,  0, 0,
    -1,  0, 0,
     0, -1, 0,
]);
const colors = new Float32Array([
    1, 0, 0, 1,
    0, 1, 0, 1,
    0, 0, 1, 1,
    1, 1, 1, 1,    
]);
const vertexBuffer = {
    position: device.createBuffer({
        size: positions.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    }),
    color: device.createBuffer({
        size: colors.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    }),
}
new Float32Array(vertexBuffer.position.getMappedRange()).set(positions);
vertexBuffer.position.unmap();
new Float32Array(vertexBuffer.color.getMappedRange()).set(colors);
vertexBuffer.color.unmap();

const indices = new Uint16Array([
    0, 1, 2,
    1, 2, 3,
]);

const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
});
new Uint16Array(indexBuffer.getMappedRange()).set(indices);
indexBuffer.unmap();

let world = mat4x4.Identity();

let eye = new vec3(0, 0, 5);
let at = new vec3(0, 0, 0);
let up = new vec3(0, 1, 0);
let view = mat4x4.LookAtRH(eye, at, up);

let projection = mat4x4.PerspectiveFovRH(deg2rad(45), canvas.width / canvas.height, 0.1, 100);
let vp = view.mul(projection);
let wvp = world.mul(vp);

const uniformBuffers = [
    device.createBuffer({
        size: wvp.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    }),
    device.createBuffer({
        size: wvp.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    }),
];

const vertexState = {
    module: shaderModule,
    entryPoint: 'VS',
    buffers: [
        {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
            attributes: [
                {
                    format: 'float32x3',
                    offset: 0,
                    shaderLocation: 0,
                },
            ]
        },
        {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 4,
            attributes: [
                {
                    format: 'float32x4',
                    offset: 0,
                    shaderLocation: 1,
                },
            ]
        },
    ],
};

const primitiveStates = [
    // enable culling unchecked
    [
        // frontface unchecked
        {
            frontFace: 'cw',
            cullMode: 'none',
        },
        // frontface checked
        {
            frontFace: 'ccw',
            cullMode: 'none',
        },
    ],
    // enable culling checked
    [
        // frontface unchecked
        {
            frontFace: 'cw',
            cullMode: 'back',
        },
        // frontface checked
        {
            frontFace: 'ccw',
            cullMode: 'back',
        },
    ]
];

const depthStencilStates = [
    {
        format: depthFormat,
        depthWriteEnabled: false,
    },
    {
        format: depthFormat,
        depthWriteEnabled: true,
        depthCompare: 'greater-equal',
    }
];

const multisampleState = {
    count: sampleCount
};

const fragmentState = {
    module: shaderModule,
    entryPoint: 'FS',
    targets: [
        {
            format: swapchainFormat
        }
    ],
};

const bindGroupLayout = device.createBindGroupLayout({
    entries: [
        {
            binding: 0, 
            visibility: GPUShaderStage.VERTEX,
            buffer: {}
        } 
    ]
});

const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout]
});

const renderPipelines = [
    // enable culling unchecked
    [
        // frontface unchecked
        [
            // depth unchecked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[0][0],
                depthStencil: depthStencilStates[0],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
            // depth checked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[0][0],
                depthStencil: depthStencilStates[1],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
        ],
        // frontface checked
        [
            // depth unchecked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[0][1],
                depthStencil: depthStencilStates[0],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
            // depth checked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[0][1],
                depthStencil: depthStencilStates[1],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
        ],
    ],
    // enable culling checked
    [
        // frontface unchecked
        [
            // depth unchecked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[1][0],
                depthStencil: depthStencilStates[0],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
            // depth checked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[1][0],
                depthStencil: depthStencilStates[1],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
        ],
        // frontface checked
        [
            // depth unchecked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[1][1],
                depthStencil: depthStencilStates[0],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
            // depth checked
            device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: vertexState,
                primitive: primitiveStates[1][1],
                depthStencil: depthStencilStates[1],
                multisample: {
                    count: sampleCount,
                },
                fragment: fragmentState,
            }),
        ],
    ],
];

const bindGroups = [
    device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffers[0],
                },   
            },
        ],
    }),
    device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffers[1],
                },   
            },
        ],
    }),
];

let start;
let prev;

function frame(timestamp){
    if(start === undefined){
        start = timestamp;
        prev = timestamp;
    }
    const delta = timestamp - prev;
    const elapsed = timestamp - start;
    prev = timestamp;

    const deg = 30 * elapsed / 1000;
    const rad = deg2rad(deg);

    const x = Math.cos(rad) * 1.5;
    const z = Math.sin(rad) * 1.5;

    world = mat4x4.RotationX(rad).mul(mat4x4.Translation(new vec3(x, 0, z)));
    wvp = world.mul(vp);
    device.queue.writeBuffer(uniformBuffers[0], 0, wvp.buffer);

    world = mat4x4.RotationY(rad).mul(mat4x4.Translation(new vec3(-x, 0, -z)));
    wvp = world.mul(vp);
    device.queue.writeBuffer(uniformBuffers[1], 0, wvp.buffer);

    const commandEncoder = device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                view: msaaTextureView,
                resolveTarget: context.getCurrentTexture().createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: 'clear',
                storeOp: 'discard',
            }
        ],
        depthStencilAttachment: {
            view: depthTextureView,
            depthClearValue: 0.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        },
    });

    renderPass.setPipeline(renderPipelines[culling.checked ? 1 : 0][frontface.checked ? 1 : 0][depth.checked ? 1 : 0]);

    renderPass.setVertexBuffer(0, vertexBuffer.position);
    renderPass.setVertexBuffer(1, vertexBuffer.color);
    renderPass.setIndexBuffer(indexBuffer, 'uint16');

    renderPass.setBindGroup(0, bindGroups[0]);
    renderPass.drawIndexed(indices.length, 1, 0, 0, 0);

    renderPass.setBindGroup(0, bindGroups[1]);
    renderPass.drawIndexed(indices.length, 1, 0, 0, 0);

    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
frame();