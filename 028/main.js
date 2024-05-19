import { mat4x4 } from '../math/mat4x4.js';
import { vec3 } from '../math/vec3.js';

function deg2rad(degree) {
    return degree * Math.PI / 180;
}

function hsva(h, s, v, a) {
    if(s > 1 || v > 1 || a > 1){
        return;
    }

    const th = h % 360;
    const i = Math.floor(th / 60);
    const f = th / 60 - i;
    const m = v * (1 - s);
    const n = v * (1 - s * f);
    const k = v * (1 - s * (1 - f));
    if(!s > 0 && !s < 0){
        return [v, v, v, a];
    } else {
        const r = [v, n, m, m, k, v, v][i];
        const g = [k, v, v, n, m, m, k][i];
        const b = [m, m, k, v, v, n, m][i];
        return [r, g, b, a];
    }
}

function torus(row, column, irad, orad, color) {
    const pos = [];
    const nor = [];
    const col = [];
    const idx = [];

    for(let i = 0; i <= row; ++i){
        const r = Math.PI * 2 / row * i;
        const rr = Math.cos(r);
        const ry = Math.sin(r);

        for(let ii = 0; ii <= column; ++ii){
            const tr = Math.PI * 2 / column * ii;
            const tx = (rr * irad + orad) * Math.cos(tr);
            const ty = ry * irad;
            const tz = (rr * irad + orad) * Math.sin(tr);
            const rx = rr * Math.cos(tr);
            const rz = rr * Math.sin(tr);
            pos.push(tx, ty, tz);
            nor.push(rx, ry, rz);
            const tc = color || hsva(360 / column * ii, 1, 1, 1);
            col.push(tc[0], tc[1], tc[2], tc[3]);
        }
    }

    for(let i = 0; i < row; ++i){
        for(let ii = 0; ii < column; ++ii){
            const r = (column + 1) * i + ii;
            idx.push(r, r + column + 1, r + 1);
            idx.push(r + column + 1, r + column + 2, r + 1);
        }
    }

    return {
        position: new Float32Array(pos),
        normal: new Float32Array(nor),
        color: new Float32Array(col),
        index: new Uint16Array(idx)
    };
}

function sphere(row, column, rad, color) {
    const pos = [];
    const nor = [];
    const col = [];
    const idx = [];

    for(let i = 0; i <= row; ++i){
        const r = Math.PI / row * i;
        const ry = Math.cos(r);
        const rr = Math.sin(r);

        for(let ii = 0; ii <= column; ++ii){
            const tr = Math.PI * 2 / column * ii;
            const tx = rr * rad * Math.cos(tr);
            const ty = ry * rad;
            const tz = rr * rad * Math.sin(tr);
            const rx = rr * Math.cos(tr);
            const rz = rr * Math.sin(tr);

            let tc = color || hsva(360 / row * i, 1, 1, 1);

            pos.push(tx, ty, tz);
            nor.push(rx, ry, rz);
            col.push(tc[0], tc[1], tc[2], tc[3]);
        }
    }

    for(let i = 0; i < row; ++i){
        for(let ii = 0; ii < column; ++ii){
            const r = (column + 1) * i + ii;
            idx.push(r, r + 1, r + column + 2);
            idx.push(r, r + column + 2, r + column + 1);
        }
    }

    return {
        position: new Float32Array(pos),
        normal: new Float32Array(nor),
        color: new Float32Array(col),
        index: new Uint16Array(idx)
    };
}

const textureImages = [
    document.getElementById('texture0'),
    document.getElementById('texture1'),
];

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
struct Scene {
    vp: mat4x4<f32>,
};
struct Model {
    w : mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> scene : Scene;
@group(0) @binding(1) var tex0 : texture_2d<f32>;
@group(0) @binding(2) var tex1 : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(1) @binding(0) var<uniform> model : Model;

struct VSIn {
    @location(0) position : vec3<f32>,
    @location(1) color : vec4<f32>,
    @location(2) uv : vec2<f32>,
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec4<f32>,
    @location(1) uv : vec2<f32>,
};

@vertex
fn VS(in : VSIn) -> VSOut {
    var out : VSOut;
    out.position = vec4<f32>(in.position, 1.0) * model.w * scene.vp;
    out.color = in.color;
    out.uv = in.uv;

    return out;
}

@fragment
fn FS(in : VSOut) -> @location(0) vec4<f32> {
    return textureSample(tex0, smp, in.uv) * textureSample(tex1, smp, in.uv) * in.color;
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

const textures = [
    device.createTexture({
        size: [ textureImages[0].width, textureImages[0].height ],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    }),
    device.createTexture({
        size: [ textureImages[1].width, textureImages[1].height ],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    }),
];
device.queue.copyExternalImageToTexture(
    { source: textureImages[0] },
    { texture: textures[0] },
    { width: textureImages[0].width, height: textureImages[0].height }
);
device.queue.copyExternalImageToTexture(
    { source: textureImages[1] },
    { texture: textures[1] },
    { width: textureImages[1].width, height: textureImages[1].height }
);

const positions = new Float32Array([
    -1.0,  1.0, 0.0,
     1.0,  1.0, 0.0,
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0
]);

const colors = new Float32Array([
    1.0, 1.0, 1.0, 1.0,
    1.0, 1.0, 1.0, 1.0,
    1.0, 1.0, 1.0, 1.0,
    1.0, 1.0, 1.0, 1.0
]);

const uvs = new Float32Array([
    -0.75, -0.75,
     1.75, -0.75,
    -0.75,  1.75,
     1.75,  1.75
]);

const indices = new Uint16Array([
    0, 1, 2,
    3, 2, 1
]);

class Mesh {
    #position;
    #color;
    #uv;
    #index;
    #indexCount;

    constructor(device, positions, colors, uvs, indices) {
        this.#position = device.createBuffer({
            size: positions.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.#position.getMappedRange()).set(positions);
        this.#position.unmap();

        this.#color = device.createBuffer({
            size: colors.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.#color.getMappedRange()).set(colors);
        this.#color.unmap();

        this.#uv = device.createBuffer({
            size: uvs.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.#uv.getMappedRange()).set(uvs);
        this.#uv.unmap();

        this.#index = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
        });
        new Uint16Array(this.#index.getMappedRange()).set(indices);
        this.#index.unmap();

        this.#indexCount = indices.length;
    }

    draw(renderPass) {
        renderPass.setVertexBuffer(0, this.#position);
        renderPass.setVertexBuffer(1, this.#color);
        renderPass.setVertexBuffer(2, this.#uv);
        renderPass.setIndexBuffer(this.#index, 'uint16');
        renderPass.drawIndexed(this.#indexCount, 1, 0, 0, 0);
    }
};

const mesh = new Mesh(device, positions, colors, uvs, indices);

let world = mat4x4.Identity();

let eye = new vec3(0, 0, 12);
let at = new vec3(0, 0, 0);
let up = new vec3(0, 1, 0);
let view = mat4x4.LookAtRH(eye, at, up);

let projection = mat4x4.PerspectiveFovRH(deg2rad(45), canvas.width / canvas.height, 0.1, 100);
let vp = view.mul(projection);

// スケールしていない前提では回転行列は転置行列が逆行列となる
let iw = world.rotation.transpose;

const lightDir = new vec3(-0.5, 0.5, 0.5).normalize();
const eyeDir = eye.normalize();
const ambientColor = new vec3(0.1, 0.1, 0.1);

const uniformBuffers = [
    device.createBuffer({
        size: vp.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    }),
];

for(let i = 1; i <= 9; ++i) {
    uniformBuffers[i] = device.createBuffer({
        size: world.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}

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
        {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
            attributes: [
                {
                    format: 'float32x2',
                    offset: 0,
                    shaderLocation: 2,
                },
            ]
        },
    ],
};

const primitiveStates = [
    {
        frontFace: 'ccw',
        cullMode: 'none',
    },
];

const depthStencilStates = [
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

const samplers = [
    device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'nearest',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'nearest',
        mipmapFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'mirror-repeat',
        addressModeV: 'mirror-repeat',
    }),
    device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    }),
];

const bindGroupLayouts = {
    scene: device.createBindGroupLayout({
        entries: [
            {
                binding: 0, 
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {}
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
        ]
    }),
    model: device.createBindGroupLayout({
        entries: [
            {
                binding: 0, 
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {}
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }, 
        ]
    }),
}

const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayouts.scene, bindGroupLayouts.model]
});

const renderPipelines = [
    device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: vertexState,
        primitive: primitiveStates[0],
        depthStencil: depthStencilStates[0],
        multisample: {
            count: sampleCount,
        },
        fragment: fragmentState,
    }),
];

const bindGroups = [
    device.createBindGroup({
        layout: bindGroupLayouts.scene,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffers[0],
                },   
            },
            {
                binding: 1,
                resource: textures[0].createView(),
            },
            {
                binding: 2,
                resource: textures[1].createView(),
            },
            
        ],
    }),
];

for(let i = 1; i <= 9; ++i) {
    bindGroups[i] = device.createBindGroup({
        layout: bindGroupLayouts.model,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffers[i],
                },
            },
            {
                binding: 1,
                resource: samplers[i - 1],
            },
        ],
    });
}

let start;
let prev;

device.queue.writeBuffer(
    uniformBuffers[0],
    0,
    vp.buffer
);

const translations = [
    mat4x4.Translation(new vec3(-6.25,  2, 0)),
    mat4x4.Translation(new vec3(-3.75,  2, 0)),
    mat4x4.Translation(new vec3(-1.25,  2, 0)),
    mat4x4.Translation(new vec3( 1.25,  2, 0)),
    mat4x4.Translation(new vec3( 3.75,  2, 0)),
    mat4x4.Translation(new vec3( 6.25,  2, 0)),
    mat4x4.Translation(new vec3(-2.50, -2, 0)),
    mat4x4.Translation(new vec3( 0.00, -2, 0)),
    mat4x4.Translation(new vec3( 2.50, -2, 0)),
];

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

    const rotation = mat4x4.RotationY(rad);

    for(let i = 1; i <= 9; ++i) {
        world = rotation.mul(translations[i - 1]);
        device.queue.writeBuffer(uniformBuffers[i], 0, world.buffer);
    }

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

    renderPass.setPipeline(renderPipelines[0]);
    renderPass.setBindGroup(0, bindGroups[0]);

    for(let i = 1; i <= 9; ++i) {
        renderPass.setBindGroup(1, bindGroups[i]);
        mesh.draw(renderPass);
    }

    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
frame();