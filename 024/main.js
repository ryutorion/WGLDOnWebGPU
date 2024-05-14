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

function torus(row, column, irad, orad) {
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
            const tc = hsva(360 / column * ii, 1, 1, 1);
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

    return { position: pos, normal: nor, color: col, index: idx };
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
    wvp : mat4x4<f32>,
    iw : mat4x4<f32>,
    lightDir : vec4<f32>,
    eyeDir : vec4<f32>,
    ambientColor : vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene : Scene;

struct VSIn {
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) color : vec4<f32>,
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
    @location(1) color : vec4<f32>,
};

@vertex
fn VS(in : VSIn) -> VSOut {
    var out : VSOut;
    out.position = vec4<f32>(in.position, 1.0) * scene.wvp;
    out.normal = in.normal;
    out.color = in.color;

    return out;
}

@fragment
fn FS(in : VSOut) -> @location(0) vec4<f32> {
    var lightDir = (scene.lightDir * scene.iw).xyz;
    var eyeDir = (scene.eyeDir * scene.iw).xyz;
    var halfLE = normalize(lightDir + eyeDir);

    var diffuse = clamp(dot(in.normal, lightDir), 0.0, 1);
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

const torusMesh = torus(64, 64, 1.5, 3);

const positions = new Float32Array(torusMesh.position);
const normals = new Float32Array(torusMesh.normal);
const colors = new Float32Array(torusMesh.color);
const vertexBuffer = {
    position: device.createBuffer({
        size: positions.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    }),
    normal: device.createBuffer({
        size: normals.byteLength,
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
new Float32Array(vertexBuffer.normal.getMappedRange()).set(normals);
vertexBuffer.normal.unmap();
new Float32Array(vertexBuffer.color.getMappedRange()).set(colors);
vertexBuffer.color.unmap();

const indices = new Uint16Array(torusMesh.index);

const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
});
new Uint16Array(indexBuffer.getMappedRange()).set(indices);
indexBuffer.unmap();

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
        size: wvp.byteLength + iw.byteLength + Float32Array.BYTES_PER_ELEMENT * 12,
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

const bindGroupLayout = device.createBindGroupLayout({
    entries: [
        {
            binding: 0, 
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: {}
        } 
    ]
});

const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout]
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
];

let start;
let prev;

device.queue.writeBuffer(
    uniformBuffers[0],
    wvp.byteLength + iw.byteLength,
    new Float32Array([lightDir.x, lightDir.y, lightDir.z, 0]).buffer
);
device.queue.writeBuffer(
    uniformBuffers[0],
    wvp.byteLength + iw.byteLength + Float32Array.BYTES_PER_ELEMENT * 4,
    new Float32Array([eyeDir.x, eyeDir.y, eyeDir.z, 0]).buffer
);
device.queue.writeBuffer(
    uniformBuffers[0],
    wvp.byteLength + iw.byteLength + Float32Array.BYTES_PER_ELEMENT * 8,
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

    world = mat4x4.RotationAxis(new vec3(0, 1, 1).normalize(), rad);
    wvp = world.mul(vp);
    iw = world.rotation.transpose;
    device.queue.writeBuffer(uniformBuffers[0], 0, wvp.buffer);
    device.queue.writeBuffer(uniformBuffers[0], wvp.byteLength, iw.buffer);

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

    renderPass.setVertexBuffer(0, vertexBuffer.position);
    renderPass.setVertexBuffer(1, vertexBuffer.normal);
    renderPass.setVertexBuffer(2, vertexBuffer.color);
    renderPass.setIndexBuffer(indexBuffer, 'uint16');

    renderPass.setBindGroup(0, bindGroups[0]);
    renderPass.drawIndexed(indices.length, 1, 0, 0, 0);

    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
frame();