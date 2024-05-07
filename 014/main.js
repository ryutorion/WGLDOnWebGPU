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

@vertex
fn VS(@location(0) position : vec3<f32>) -> @builtin(position) vec4<f32> {
    return vec4<f32>(position, 1.0) * wvp;
}

@fragment
fn FS() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 1.0, 1.0, 1.0);
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

const vertices = new Float32Array([
     0, 1, 0,
     1, 0, 0,
    -1, 0, 0,
]);
const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true
});
new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
vertexBuffer.unmap();

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
renderPass.setVertexBuffer(0, vertexBuffer);
renderPass.draw(3, 1, 0, 0);
renderPass.end();

device.queue.submit([commandEncoder.finish()]);