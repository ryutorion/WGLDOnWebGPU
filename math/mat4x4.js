export class mat4x4 {
    #m;

    constructor(
        m00, m01, m02, m03,
        m10, m11, m12, m13,
        m20, m21, m22, m23,
        m30, m31, m32, m33
    ) {
        this.#m = new Float32Array([
            m00, m10, m20, m30,
            m01, m11, m21, m31,
            m02, m12, m22, m32,
            m03, m13, m23, m33
        ]);
    }
    
    static Identity() {
        return new mat4x4(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
    }

    static Translation(t) {
        return new mat4x4(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            t.x, t.y, t.z, 1
        );
    }

    static Scale(s) {
        return new mat4x4(
            s.x, 0, 0, 0,
            0, s.y, 0, 0,
            0, 0, s.z, 0,
            0, 0, 0, 1
        );
    }

    static RotationX(rad) {
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return new mat4x4(
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1
        );
    }

    static RotationY(rad) {
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return new mat4x4(
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        );
    }

    static RotationZ(rad) {
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return new mat4x4(
            c, s, 0, 0,
            -s, c, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
    }

    static RotationAxis(axis, rad) {
        axis = axis.normalize();
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const xx = axis.x * axis.x;
        const xy = axis.x * axis.y;
        const xz = axis.x * axis.z;
        const yy = axis.y * axis.y;
        const yz = axis.y * axis.z;
        const zz = axis.z * axis.z;

        return new mat4x4(
            xx * (1 - c) + c,          xy * (1 - c) + axis.z * s, xz * (1 - c) - axis.y * s, 0,
            xy * (1 - c) - axis.z * s, yy * (1 - c) + c,          yz * (1 - c) + axis.x * s, 0,
            xz * (1 - c) + axis.y * s, yz * (1 - c) - axis.x * s, zz * (1 - c) + c,          0,
            0,                         0,                         0,                         1
        );
    }

    static LookAtRH(eye, at, up) {
        const z = eye.sub(at).normalize();
        const x = up.cross(z).normalize();
        const y = z.cross(x);

        return new mat4x4(
            x.x, y.x, z.x, 0,
            x.y, y.y, z.y, 0,
            x.z, y.z, z.z, 0,
            -x.dot(eye), -y.dot(eye), -z.dot(eye), 1
        );
    }

    static PerspectiveFovRH(fov, aspect, near, far) {
        const scaleY = 1 / Math.tan(fov * 0.5);
        const scaleX = scaleY / aspect;
        const scaleZ = near / (far - near);
        const transZ = near * far / (far - near);

        return new mat4x4(
            scaleX, 0, 0, 0,
            0, scaleY, 0, 0,
            0, 0, scaleZ, -1,
            0, 0, transZ, 0
        );
    }

    get byteLength() {
        return this.#m.byteLength;
    }

    get buffer() {
        return this.#m.buffer;
    }

    mapToBuffer(buffer) {
        new Float32Array(buffer.getMappedRange()).set(this.#m);
    }

    get transpose() {
        return new mat4x4(
            this.#m[ 0], this.#m[ 1], this.#m[ 2], this.#m[ 3],
            this.#m[ 4], this.#m[ 5], this.#m[ 6], this.#m[ 7],
            this.#m[ 8], this.#m[ 9], this.#m[10], this.#m[11],
            this.#m[12], this.#m[13], this.#m[14], this.#m[15]
        );
    }

    // スケールしていない前提
    get rotation() {
        return new mat4x4(
            this.#m[ 0], this.#m[ 4], this.#m[ 8], 0,
            this.#m[ 1], this.#m[ 5], this.#m[ 9], 0,
            this.#m[ 2], this.#m[ 6], this.#m[10], 0,
            0, 0, 0, 1
        );
    }

    mul(m) {
        return new mat4x4(
            this.#m[ 0] * m.#m[ 0] +
            this.#m[ 4] * m.#m[ 1] +
            this.#m[ 8] * m.#m[ 2] +
            this.#m[12] * m.#m[ 3],
            this.#m[ 0] * m.#m[ 4] +
            this.#m[ 4] * m.#m[ 5] +
            this.#m[ 8] * m.#m[ 6] +
            this.#m[12] * m.#m[ 7],
            this.#m[ 0] * m.#m[ 8] +
            this.#m[ 4] * m.#m[ 9] +
            this.#m[ 8] * m.#m[10] +
            this.#m[12] * m.#m[11],
            this.#m[ 0] * m.#m[12] +
            this.#m[ 4] * m.#m[13] +
            this.#m[ 8] * m.#m[14] +
            this.#m[12] * m.#m[15],
            
            this.#m[ 1] * m.#m[ 0] +
            this.#m[ 5] * m.#m[ 1] +
            this.#m[ 9] * m.#m[ 2] +
            this.#m[13] * m.#m[ 3],
            this.#m[ 1] * m.#m[ 4] +
            this.#m[ 5] * m.#m[ 5] +
            this.#m[ 9] * m.#m[ 6] +
            this.#m[13] * m.#m[ 7],
            this.#m[ 1] * m.#m[ 8] +
            this.#m[ 5] * m.#m[ 9] +
            this.#m[ 9] * m.#m[10] +
            this.#m[13] * m.#m[11],
            this.#m[ 1] * m.#m[12] +
            this.#m[ 5] * m.#m[13] +
            this.#m[ 9] * m.#m[14] +
            this.#m[13] * m.#m[15],

            this.#m[ 2] * m.#m[ 0] +
            this.#m[ 6] * m.#m[ 1] +
            this.#m[10] * m.#m[ 2] +
            this.#m[14] * m.#m[ 3],
            this.#m[ 2] * m.#m[ 4] +
            this.#m[ 6] * m.#m[ 5] +
            this.#m[10] * m.#m[ 6] +
            this.#m[14] * m.#m[ 7],
            this.#m[ 2] * m.#m[ 8] +
            this.#m[ 6] * m.#m[ 9] +
            this.#m[10] * m.#m[10] +
            this.#m[14] * m.#m[11],
            this.#m[ 2] * m.#m[12] +
            this.#m[ 6] * m.#m[13] +
            this.#m[10] * m.#m[14] +
            this.#m[14] * m.#m[15],

            this.#m[ 3] * m.#m[ 0] +
            this.#m[ 7] * m.#m[ 1] +
            this.#m[11] * m.#m[ 2] +
            this.#m[15] * m.#m[ 3],
            this.#m[ 3] * m.#m[ 4] +
            this.#m[ 7] * m.#m[ 5] +
            this.#m[11] * m.#m[ 6] +
            this.#m[15] * m.#m[ 7],
            this.#m[ 3] * m.#m[ 8] +
            this.#m[ 7] * m.#m[ 9] +
            this.#m[11] * m.#m[10] +
            this.#m[15] * m.#m[11],
            this.#m[ 3] * m.#m[12] +
            this.#m[ 7] * m.#m[13] +
            this.#m[11] * m.#m[14] +
            this.#m[15] * m.#m[15],
        );
    }
};