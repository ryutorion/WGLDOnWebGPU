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
struct Scene {
    vp: mat4x4<f32>,
    lightPos : vec4<f32>,
    eyeDir : vec4<f32>,
    ambientColor : vec4<f32>,
};
struct Model {
    w : mat4x4<f32>,
    iw : mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> scene : Scene;
@group(1) @binding(0) var<uniform> model : Model;

struct VSIn {
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) color : vec4<f32>,
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
    @location(0) wpos : vec4<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) color : vec4<f32>,
};

@vertex
fn VS(in : VSIn) -> VSOut {
    var out : VSOut;
    out.position = vec4<f32>(in.position, 1.0) * model.w * scene.vp;
    out.wpos = vec4<f32>(in.position, 1.0) * model.w;
    out.normal = in.normal;
    out.color = in.color;

    return out;
}

@fragment
fn FS(in : VSOut) -> @location(0) vec4<f32> {
    var lightDir = normalize(((scene.lightPos - in.wpos) * model.iw).xyz);
    var eyeDir = (scene.eyeDir * model.iw).xyz;
    var halfLE = normalize(lightDir + eyeDir);

    var diffuse = clamp(dot(in.normal, lightDir), 0.0, 1) + 0.2;
    var specular = pow(clamp(dot(in.normal, halfLE), 0.0, 1), 50);
    return vec4<f32>(in.color.xyz * diffuse + vec3<f32>(specular) + scene.ambientColor.xyz, in.color.a);
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

class Mesh {
    #position;
    #normal;
    #color;
    #index;
    #indexCount;

    constructor(device, positions, normals, colors, indices) {
        this.#position = device.createBuffer({
            size: positions.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.#position.getMappedRange()).set(positions);
        this.#position.unmap();

        this.#normal = device.createBuffer({
            size: normals.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.#normal.getMappedRange()).set(normals);
        this.#normal.unmap();

        this.#color = device.createBuffer({
            size: colors.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.#color.getMappedRange()).set(colors);
        this.#color.unmap();

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
        renderPass.setVertexBuffer(1, this.#normal);
        renderPass.setVertexBuffer(2, this.#color);
        renderPass.setIndexBuffer(this.#index, 'uint16');
        renderPass.drawIndexed(this.#indexCount, 1, 0, 0, 0);
    }
};

const torusMeshData = torus(64, 64, 0.5, 1.5, [0.75, 0.25, 0.25, 1.0]);
const torusMesh = new Mesh(
    device,
    torusMeshData.position,
    torusMeshData.normal,
    torusMeshData.color,
    torusMeshData.index
);

const sphereMeshData = sphere(64, 64, 2, [0.25, 0.25, 0.75, 1.0]);
const sphereMesh = new Mesh(
    device,
    sphereMeshData.position,
    sphereMeshData.normal,
    sphereMeshData.color,
    sphereMeshData.index
);

let world = mat4x4.Identity();

let eye = new vec3(0, 0, 20);
let at = new vec3(0, 0, 0);
let up = new vec3(0, 1, 0);
let view = mat4x4.LookAtRH(eye, at, up);

let projection = mat4x4.PerspectiveFovRH(deg2rad(45), canvas.width / canvas.height, 0.1, 100);
let vp = view.mul(projection);
let wvp = world.mul(vp);

// スケールしていない前提では回転行列は転置行列が逆行列となる
let iw = world.rotation.transpose;

const lightDir = new vec3(-0.5, 0.5, 0.5).normalize();
const eyeDir = eye.normalize();
const ambientColor = new vec3(0.1, 0.1, 0.1);

const uniformBuffers = [
    device.createBuffer({
        size: vp.byteLength + Float32Array.BYTES_PER_ELEMENT * (4 * 3),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    }),
    device.createBuffer({
        size: world.byteLength + iw.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    }),
    device.createBuffer({
        size: world.byteLength + iw.byteLength,
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
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
            attributes: [
                {
                    format: 'float32x3',
                    offset: 0,
                    shaderLocation: 1,
                },
            ]
        },
        {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 4,
            attributes: [
                {
                    format: 'float32x4',
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
        cullMode: 'back',
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

const bindGroupLayouts = {
    scene: device.createBindGroupLayout({
        entries: [
            {
                binding: 0, 
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {}
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
        ],
    }),
    device.createBindGroup({
        layout: bindGroupLayouts.model,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffers[1],
                },
            },
        ],
    }),
    device.createBindGroup({
        layout: bindGroupLayouts.model,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffers[2],
                },
            },
        ],
    }),
];

let start;
let prev;

device.queue.writeBuffer(
    uniformBuffers[0],
    0,
    vp.buffer
);
device.queue.writeBuffer(
    uniformBuffers[0],
    vp.byteLength,
    new Float32Array([lightDir.x, lightDir.y, lightDir.z, 0]).buffer
);
device.queue.writeBuffer(
    uniformBuffers[0],
    vp.byteLength + Float32Array.BYTES_PER_ELEMENT * 4,
    new Float32Array([eyeDir.x, eyeDir.y, eyeDir.z, 0]).buffer
);
device.queue.writeBuffer(
    uniformBuffers[0],
    vp.byteLength + Float32Array.BYTES_PER_ELEMENT * 8,
    new Float32Array([ambientColor.x, ambientColor.y, ambientColor.z, 0]).buffer
);

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
    const tx = Math.cos(rad) * 3.5;
    const ty = Math.sin(rad) * 3.5;
    const tz = Math.sin(rad) * 3.5;

    world = mat4x4.RotationAxis(new vec3(0, 1, 1).normalize(), -rad);
    world = world.mul(mat4x4.Translation(new vec3(tx, -ty, -tz)));
    iw = world.rotation.transpose;
    device.queue.writeBuffer(uniformBuffers[1], 0, world.buffer);
    device.queue.writeBuffer(uniformBuffers[1], world.byteLength, iw.buffer);

    world = mat4x4.Translation(new vec3(-tx, ty, tz));
    iw = world.rotation.transpose;
    device.queue.writeBuffer(uniformBuffers[2], 0, world.buffer);
    device.queue.writeBuffer(uniformBuffers[2], world.byteLength, iw.buffer);

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

    renderPass.setBindGroup(1, bindGroups[1]);
    torusMesh.draw(renderPass);
    renderPass.setBindGroup(1, bindGroups[2]);
    sphereMesh.draw(renderPass);

    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
frame();