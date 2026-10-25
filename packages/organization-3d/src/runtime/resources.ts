import * as THREE from "three";

function disposeMaterial(material: THREE.Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

/** Disposes every geometry, material, and texture reachable from `root`. */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      mat.forEach(disposeMaterial);
    } else if (mat) {
      disposeMaterial(mat);
    }
  });
}

/** Tracks GPU resources created by a scene adapter so they can be released together. */
export class ResourceTracker {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();

  geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  material<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  texture<T extends THREE.Texture>(texture: T): T {
    this.textures.add(texture);
    return texture;
  }

  disposeAll(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }
}
