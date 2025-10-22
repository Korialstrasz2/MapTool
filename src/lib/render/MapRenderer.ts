import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { GeneratorResult } from '$lib/types/generation';
import { hypsometricColor, biomeColor } from '$lib/utils/color';
import { decodeBiome } from '$lib/utils/biomes';

export class MapRenderer {
  #app: Application;
  #container: Container;
  #heightLayer: Sprite | null = null;
  #biomeLayer: Sprite | null = null;
  #waterLayer: Sprite | null = null;

  constructor(private node: HTMLElement) {
    this.#app = new Application({
      width: node.clientWidth,
      height: node.clientHeight,
      backgroundColor: 0x0b172a,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    this.#container = new Container();
    this.#app.stage.addChild(this.#container);
    this.node.appendChild(this.#app.view as HTMLCanvasElement);

    const resize = () => {
      this.#app.renderer.resize(this.node.clientWidth, this.node.clientHeight);
      this.#container.scale.set(
        this.node.clientWidth / this.#app.renderer.width,
        this.node.clientHeight / this.#app.renderer.height
      );
    };

    resize();
    window.addEventListener('resize', resize);
  }

  destroy(): void {
    this.#app.destroy(true, { children: true });
  }

  render(result: GeneratorResult): void {
    const heightTexture = this.#buildHeightTexture(result);
    const biomeTexture = this.#buildBiomeTexture(result);
    const waterTexture = this.#buildWaterTexture(result);

    this.#updateLayer('height', heightTexture);
    this.#updateLayer('biome', biomeTexture);
    this.#updateLayer('water', waterTexture);
  }

  #updateLayer(layer: 'height' | 'biome' | 'water', texture: Texture): void {
    const sprite = new Sprite({ texture });
    sprite.width = this.node.clientWidth;
    sprite.height = this.node.clientHeight;

    switch (layer) {
      case 'height':
        if (this.#heightLayer) {
          this.#heightLayer.destroy();
        }
        this.#heightLayer = sprite;
        this.#container.addChildAt(sprite, 0);
        break;
      case 'biome':
        if (this.#biomeLayer) {
          this.#biomeLayer.destroy();
        }
        sprite.alpha = 0.65;
        this.#biomeLayer = sprite;
        this.#container.addChild(sprite);
        break;
      case 'water':
        if (this.#waterLayer) {
          this.#waterLayer.destroy();
        }
        sprite.alpha = 0.9;
        this.#waterLayer = sprite;
        this.#container.addChild(sprite);
        break;
    }
  }

  #buildHeightTexture(result: GeneratorResult): Texture {
    const { width, height, heightmap, flow } = result;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i += 1) {
      const h = heightmap[i];
      const slope = Math.min(flow[i] * 0.1, 1.0);
      const color = hypsometricColor(h);
      const shade = 1 - slope * 0.35;
      const baseIndex = i * 4;
      data[baseIndex] = Math.max(0, Math.min(255, color[0] * shade));
      data[baseIndex + 1] = Math.max(0, Math.min(255, color[1] * shade));
      data[baseIndex + 2] = Math.max(0, Math.min(255, color[2] * shade));
      data[baseIndex + 3] = 255;
    }

    return Texture.fromBuffer(data, width, height);
  }

  #buildBiomeTexture(result: GeneratorResult): Texture {
    const { width, height, biome } = result;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i += 1) {
      const color = biomeColor(decodeBiome(biome[i]));
      const baseIndex = i * 4;
      data[baseIndex] = color[0];
      data[baseIndex + 1] = color[1];
      data[baseIndex + 2] = color[2];
      data[baseIndex + 3] = 200;
    }

    return Texture.fromBuffer(data, width, height);
  }

  #buildWaterTexture(result: GeneratorResult): Texture {
    const { width, height, water } = result;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i += 1) {
      const intensity = Math.min(1, water[i] * 1.5);
      const baseIndex = i * 4;
      data[baseIndex] = 28;
      data[baseIndex + 1] = 88;
      data[baseIndex + 2] = 160;
      data[baseIndex + 3] = Math.floor(120 + intensity * 135);
    }

    return Texture.fromBuffer(data, width, height);
  }
}
