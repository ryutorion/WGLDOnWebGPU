import { mat4x4 } from '../math/mat4x4.js';
import { vec3 } from '../math/vec3.js';

function deg2rad(degree) {
    return degree * Math.PI / 180;
}

const swapchainFormat = navigator.gpu.getPreferredCanvasFormat();
const sampleCount = 4;
const depthFormat = 'depth32float';
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.getElementById('canvas');
canvas.width = 300;
canvas.height = 300;
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
     0, 1, 0,
     1, 0, 0,
    -1, 0, 0,
]);
const colors = new Float32Array([
    1, 0, 0, 1,
    0, 1, 0, 1,
    0, 0, 1, 1,    
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

let world = mat4x4.Identity();

let eye = new vec3(0, 1, 3);
let at = new vec3(0, 0, 0);
let up = new vec3(0, 1, 0);
let view = mat4x4.LookAtRH(eye, at, up);

let projection = mat4x4.PerspectiveFovRH(deg2rad(90), canvas.width / canvas.height, 0.1, 100);

let wvp = world.mul(view).mul(projection);

const uniformBuffer = device.createBuffer({
    size: wvp.byteLength,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
});
wvp.mapToBuffer(uniformBuffer);
uniformBuffer.unmap();

const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
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
    },
    depthStencil: {
        format: depthFormat,
        depthWriteEnabled: true,
        depthCompare: 'greater-equal',
    },
    multisample: {
        count: sampleCount,
    },
    fragment: {
        module: shaderModule,
        entryPoint: 'FS',
        targets: [
            {
                format: swapchainFormat
            }
        ],
    },
});

const bindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: uniformBuffer,
            },   
        },
    ],    
});

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

renderPass.setPipeline(renderPipeline);
renderPass.setBindGroup(0, bindGroup);
renderPass.setVertexBuffer(0, vertexBuffer.position);
renderPass.setVertexBuffer(1, vertexBuffer.color);
renderPass.draw(3, 1, 0, 0);
renderPass.end();

device.queue.submit([commandEncoder.finish()]);