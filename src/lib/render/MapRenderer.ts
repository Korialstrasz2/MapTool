import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { GeneratorResult } from '$lib/types/generation';
import { hypsometricColor, biomeColor } from '$lib/utils/color';
import { decodeBiome } from '$lib/utils/biomes';

function resolveCanvas(app: Application): HTMLCanvasElement {
  const withCanvas = app as unknown as { canvas?: HTMLCanvasElement; view?: HTMLCanvasElement };
  const canvas = withCanvas.canvas ?? withCanvas.view;

  if (!canvas) {
    throw new Error('PIXI Application did not expose a canvas element.');
  }

  return canvas;
}

export class MapRenderer {
  #app: Application | null = null;
  #container: Container | null = null;
  #heightLayer: Sprite | null = null;
  #biomeLayer: Sprite | null = null;
  #waterLayer: Sprite | null = null;
  #resizeListener: (() => void) | null = null;

  private constructor(private node: HTMLElement) {}

  static async create(node: HTMLElement): Promise<MapRenderer> {
    const renderer = new MapRenderer(node);
    await renderer.#initialize();
    return renderer;
  }

  async #initialize(): Promise<void> {
    const dimensions = {
      width: Math.max(1, this.node.clientWidth),
      height: Math.max(1, this.node.clientHeight)
    };

    console.info('[MapTool][Renderer] Initializing PIXI renderer', dimensions);

    const app = new Application();
    await app.init({
      ...dimensions,
      backgroundColor: 0x0b172a,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    this.#app = app;
    this.#container = new Container();
    this.#app.stage.addChild(this.#container);

    const canvas = resolveCanvas(this.#app);
    this.node.appendChild(canvas);

    const resize = () => {
      if (!this.#app || !this.#container) {
        console.warn('[MapTool][Renderer] Resize requested before renderer was ready.');
        return;
      }

      const targetWidth = Math.max(1, this.node.clientWidth);
      const targetHeight = Math.max(1, this.node.clientHeight);

      this.#app.renderer.resize(targetWidth, targetHeight);
      this.#container.scale.set(
        targetWidth / this.#app.renderer.width,
        targetHeight / this.#app.renderer.height
      );
    };

    this.#resizeListener = resize;
    resize();
    window.addEventListener('resize', resize);

    console.info('[MapTool][Renderer] PIXI renderer ready', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
  }

  destroy(): void {
    console.info('[MapTool][Renderer] Destroying renderer.');

    if (this.#resizeListener) {
      window.removeEventListener('resize', this.#resizeListener);
      this.#resizeListener = null;
    }

    this.#heightLayer?.destroy();
    this.#heightLayer = null;
    this.#biomeLayer?.destroy();
    this.#biomeLayer = null;
    this.#waterLayer?.destroy();
    this.#waterLayer = null;

    this.#container?.destroy({ children: true });
    this.#container = null;

    this.#app?.destroy(true, { children: true });
    this.#app = null;
  }

  render(result: GeneratorResult): void {
    if (!this.#app || !this.#container) {
      console.warn('[MapTool][Renderer] Attempted to render before initialization completed.');
      return;
    }

    console.info('[MapTool][Renderer] Rendering generator result', {
      width: result.width,
      height: result.height
    });

    const heightTexture = this.#buildHeightTexture(result);
    const biomeTexture = this.#buildBiomeTexture(result);
    const waterTexture = this.#buildWaterTexture(result);

    this.#updateLayer('height', heightTexture);
    this.#updateLayer('biome', biomeTexture);
    this.#updateLayer('water', waterTexture);
  }

  #updateLayer(layer: 'height' | 'biome' | 'water', texture: Texture): void {
    if (!this.#container) {
      console.warn('[MapTool][Renderer] Cannot update layer; container missing.');
      return;
    }

    const sprite = new Sprite({ texture });
    sprite.width = this.node.clientWidth;
    sprite.height = this.node.clientHeight;

    switch (layer) {
      case 'height':
        this.#heightLayer?.destroy();
        this.#heightLayer = sprite;
        this.#container.addChildAt(sprite, 0);
        break;
      case 'biome':
        this.#biomeLayer?.destroy();
        sprite.alpha = 0.65;
        this.#biomeLayer = sprite;
        this.#container.addChild(sprite);
        break;
      case 'water':
        this.#waterLayer?.destroy();
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

    return this.#textureFromRgba(data, width, height);
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

    return this.#textureFromRgba(data, width, height);
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

    return this.#textureFromRgba(data, width, height);
  }

  #textureFromRgba(data: Uint8ClampedArray, width: number, height: number): Texture {
    // PIXI v8 no longer accepts ImageData instances when constructing textures.
    // Using `Texture.fromBuffer` avoids relying on browser-specific globals and
    // works consistently in web workers and during SSR.
    const buffer =
      data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return Texture.fromBuffer(buffer, width, height);
  }
}
