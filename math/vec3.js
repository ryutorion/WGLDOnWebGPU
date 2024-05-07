export class vec3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    add(v) {
        return new vec3(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    sub(v) {
        return new vec3(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    scale(s) {
        return new vec3(this.x * s, this.y * s, this.z * s);
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    get length() {
        return Math.sqrt(this.dot(this));
    }

    normalize() {
        return this.scale(1 / this.length);
    }

    cross(v) {
        return new vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }
};