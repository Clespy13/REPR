import { GUI } from 'dat.gui';
import { mat4, vec3 } from 'gl-matrix';
import { Camera } from './camera';
import { SphereGeometry } from './geometries/sphere';
import { GLContext } from './gl';
import { PBRShader } from './shader/pbr-shader';
import { Texture, Texture2D } from './textures/texture';
import { UniformType } from './types';
import { PointLight } from './lights/lights';

// GUI elements
interface GUIProperties {
  albedo: number[];
  roughness: number;
  metallic: number;
}

interface SphereProperties {
  roughness: number;
  metallic: number;
}

/**
 * Class representing the current application with its state.
 *
 * @class Application
 */
class Application {
  private _context: GLContext; // Context used to draw to the canvas
  private _shader: PBRShader;
  private _geometry: SphereGeometry;
  private _uniforms: Record<string, UniformType | Texture>;
  private _textureExample: Texture2D<HTMLElement> | null;
  private _camera: Camera;
  private _guiProperties: GUIProperties; // Object updated with the properties from the GUI
  private _lights: PointLight[];
  private _sphereProperties: SphereProperties[][]; // 2D array [row][column]

  constructor(canvas: HTMLCanvasElement) {
    this._context = new GLContext(canvas);
    this._camera = new Camera(0.0, 0.0, 18.0);
    this._geometry = new SphereGeometry();
    this._shader = new PBRShader();
    this._textureExample = null;
    this._uniforms = {
      'roughness': 0.5,
      'metallic': 0.0,
      'uMaterial.albedo': vec3.create(),
      'uModel.LS_to_WS': mat4.create(),
      'uCamera.WS_to_CS': mat4.create(),
      'uCamera.pos': vec3.create(),

      'uLightCount': 0,
      'uLightPositions[0]': new Float32Array(0),
      'uLightColors[0]': new Float32Array(0),
      'uLightIntensities[0]': new Float32Array(0),
    };

    // Set GUI default values
    this._guiProperties = {
      albedo: [255, 255, 255],
      roughness: 0.5,
      metallic: 0.0,
    };

    this._lights = [
      new PointLight(vec3.fromValues(-10, 10, 10), vec3.fromValues(1, 1, 1), 2000.0),
      new PointLight(vec3.fromValues(10, 10, 10), vec3.fromValues(1, 1, 1), 2000.0),
      new PointLight(vec3.fromValues(-10, -10, 10), vec3.fromValues(1, 1, 1), 2000.0),
      new PointLight(vec3.fromValues(10, -10, 10), vec3.fromValues(1, 1, 1), 2000.0)
    ];

    // Initialize sphere properties for 5x5 grid
    const rows = 5;
    const columns = 5;
    this._sphereProperties = [];
    for (let r = 0; r < rows; ++r) {
      this._sphereProperties[r] = [];
      for (let c = 0; c < columns; ++c) {
        this._sphereProperties[r][c] = {
          roughness: 0.01 + (c / (columns - 1)) * 0.99,
          metallic: r / (rows - 1)
        };
      }
    }

    // Creates a GUI floating on the upper right side of the page.
    // You are free to do whatever you want with this GUI.
    // It's useful to have parameters you can dynamically change to see what happens.
    const gui = new GUI();
    gui.addColor(this._guiProperties, 'albedo');

    this._lights.forEach((light, index) => {
      const lightFolder = gui.addFolder(`Light ${index + 1}`);
      const colorWrapper = {
        color: [light.color[0] * 255, light.color[1] * 255, light.color[2] * 255]
      };
      
      lightFolder.addColor(colorWrapper, 'color').onChange((value: number[]) => {
        vec3.set(light.color, value[0] / 255, value[1] / 255, value[2] / 255);
      });
      

      lightFolder.add(light, 'intensity', 0.0, 2000.0);      
      lightFolder.add(light.positionWS, '0', -10.0, 10.0).name('x');
      lightFolder.add(light.positionWS, '1', -10.0, 10.0).name('y');
      lightFolder.add(light.positionWS, '2', -10.0, 10.0).name('z');
      lightFolder.open();
    });

    // Add GUI controls for each sphere
    const spheresFolder = gui.addFolder('Spheres');
    for (let r = 0; r < rows; ++r) {
      for (let c = 0; c < columns; ++c) {
        const sphereFolder = spheresFolder.addFolder(`Sphere [${r},${c}]`);
        sphereFolder.add(this._sphereProperties[r][c], 'metallic', 0.0, 1.0);
        sphereFolder.add(this._sphereProperties[r][c], 'roughness', 0.01, 1.0);
      }
    }
  }

  /**
   * Initializes the application.
   */
  async init() {
    this._context.uploadGeometry(this._geometry);
    this._context.compileProgram(this._shader);

    // Example showing how to load a texture and upload it to GPU.
    this._textureExample = await Texture2D.load(
      'assets/ggx-brdf-integrated.png'
    );
    if (this._textureExample !== null) {
      this._context.uploadTexture(this._textureExample);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }

    // Handle keyboard and mouse inputs to translate and rotate camera.
    canvas.addEventListener('keydown', this._camera.onKeyDown.bind(this._camera), true);
    canvas.addEventListener('pointerdown', this._camera.onPointerDown.bind(this._camera), true);
    canvas.addEventListener('pointermove', this._camera.onPointerMove.bind(this._camera), true);
    canvas.addEventListener('pointerup', this._camera.onPointerUp.bind(this._camera), true);
    canvas.addEventListener('pointerleave', this._camera.onPointerUp.bind(this._camera), true);
  }

  /**
   * Called at every loop, before the [[Application.render]] method.
   */
  update() {
    /** Empty. */
  }

  /**
   * Called when the canvas size changes.
   */
  resize() {
    this._context.resetViewport();
  }

  /**
   * Called at every loop, after the [[Application.update]] method.
   */
  render() {
    this._context.clear();
    this._context.setDepthTest(true);

    const props = this._guiProperties;

    // Set the albedo uniform using the GUI value
    this._uniforms['uMaterial.albedo'] = vec3.fromValues(
      props.albedo[0] / 255,
      props.albedo[1] / 255,
      props.albedo[2] / 255);

    // Set World-Space to Clip-Space transformation matrix (a.k.a view-projection).
    const aspect = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
    let WS_to_CS = this._uniforms['uCamera.WS_to_CS'] as mat4;
    mat4.multiply(WS_to_CS, this._camera.computeProjection(aspect), this._camera.computeView());

    this._uniforms['uCamera.pos'] = this._camera._position;

    this._uniforms['roughness'] = props.roughness;
    this._uniforms['metallic'] = props.metallic;

    // Update light uniforms from GUI properties
    const lightCount = this._lights.length;
    const positions = new Float32Array(lightCount * 3);
    const colors = new Float32Array(lightCount * 3);
    const intensities = new Float32Array(lightCount);

    this._lights.forEach((light, index) => {
      positions[index * 3] = light.positionWS[0];
      positions[index * 3 + 1] = light.positionWS[1];
      positions[index * 3 + 2] = light.positionWS[2];

      colors[index * 3] = light.color[0];
      colors[index * 3 + 1] = light.color[1];
      colors[index * 3 + 2] = light.color[2];

      intensities[index] = light.intensity;
    });

    this._uniforms['uLightCount'] = lightCount;
    this._uniforms['uLightPositions[0]'] = positions;
    this._uniforms['uLightColors[0]'] = colors;
    this._uniforms['uLightIntensities[0]'] = intensities;


    // Draw the 5x5 grid of spheres
    const rows = 5;
    const columns = 5;
    const spacing = this._geometry.radius * 2.5;
    for (let r = 0; r < rows; ++r) {
      for (let c = 0; c < columns; ++c) {
        this._uniforms['metallic'] = this._sphereProperties[r][c].metallic;
        this._uniforms['roughness'] = this._sphereProperties[r][c].roughness;

        // Set Local-Space to World-Space transformation matrix (a.k.a model).
        const WsSphereTranslation = vec3.fromValues(
          (c - columns * 0.5) * spacing + spacing * 0.5,
          (r - rows * 0.5) * spacing + spacing * 0.5,
          0.0
        );
        const LS_to_WS = this._uniforms["uModel.LS_to_WS"] as mat4;
        mat4.fromTranslation(LS_to_WS, WsSphereTranslation);

        // Draw the triangles
        this._context.draw(this._geometry, this._shader, this._uniforms);
      }
    }
  }
}

const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const app = new Application(canvas as HTMLCanvasElement);
app.init();

function animate() {
  app.update();
  app.render();
  window.requestAnimationFrame(animate);
}
animate();

/**
 * Handles resize.
 */
const resizeObserver = new ResizeObserver((entries) => {
  if (entries.length > 0) {
    const entry = entries[0];
    canvas.width = window.devicePixelRatio * entry.contentRect.width;
    canvas.height = window.devicePixelRatio * entry.contentRect.height;
    app.resize();
  }
});

resizeObserver.observe(canvas);
