export default `
precision highp float;

// Attributes (vertex shader inputs)
in vec3 in_position;
in vec3 in_normal;
#ifdef USE_UV
  in vec2 in_uv;
#endif

// Varyings (vertex shader outputs)
out vec3 vPositionWS;
out vec3 vNormalWS;
out vec3 ViewDirectionWS;
out vec3 lightImpact;
#ifdef USE_UV
  out vec2 vUv;
#endif

// Uniforms
struct Camera
{
  mat4 WS_to_CS; // World-Space to Clip-Space (proj * view)
  vec3 pos;
};
uniform Camera uCamera;

struct Model
{
  mat4 LS_to_WS; // Local-Space to World-Space
};
uniform Model uModel;

void main()
{
  vec4 positionLocal = vec4(in_position, 1.0);
  vec4 positionWS4   = uModel.LS_to_WS * positionLocal;
  vPositionWS = positionWS4.xyz;
  gl_Position = uCamera.WS_to_CS * uModel.LS_to_WS * positionLocal;

  // vNormalWS = normalize((uModel.LS_to_WS * vec4(in_normal * 0.5 + 0.5, 1.0)).xyz); // remap to [0, 1] instead of [-1, 1]
  vNormalWS = normalize((uModel.LS_to_WS * vec4(in_normal, 0.0)).xyz);

  ViewDirectionWS = normalize((vec4(uCamera.pos, 1.0) - uModel.LS_to_WS * vec4(in_position, 1.0)).xyz);
}
`;
