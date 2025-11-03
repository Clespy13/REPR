export default `
precision highp float;

// Fragment shader output
out vec4 outFragColor;

in vec3 vPositionWS;
in vec3 vNormalWS;
in vec3 ViewDirectionWS;

// Uniforms
struct Material
{
  vec3 albedo;
};
uniform Material uMaterial;

const int MAX_LIGHTS = 10;

// Light uniforms
uniform int uLightCount;
uniform float uLightPositions[MAX_LIGHTS * 3];
uniform float uLightColors[MAX_LIGHTS * 3];
uniform float uLightIntensities[MAX_LIGHTS];

struct PointLight {
  vec3 pos;
  vec3 color;
  float intensity;
};

uniform float roughness;
uniform float metallic;

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

vec3 calculatePointLight(PointLight light, vec3 position) {
  vec3 w_i = light.pos - position;
  float distance = length(w_i);
  return light.color * (light.intensity / (4.0 * 3.14159 * distance * distance));
}

vec3 tonemap(vec3 color) {
  // Reinhard tonemapping
  return color / (color + vec3(1.0));
}

vec3 calculateDiffuseBRDF(vec3 albedo) {
  // Lambertian BRDF
  return albedo / 3.14159;
}

float calculateDistributionGGX(vec3 normal, vec3 halfVector, float roughness) {
  float a2 = roughness * roughness;
  float nDotH = max(dot(normal, halfVector), 0.0);
  float nDotH2 = nDotH * nDotH;
  float denom = (nDotH2 * (a2 - 1.0) + 1.0);
  denom = 3.14159 * denom * denom;
  return a2 / denom;
}

float calculateGeometrySchlick(vec3 normal, vec3 dir, float k)
{
  float ndot = max(dot(normal, dir), 0.0);
  return ndot / (ndot * (1.0 - k) + k);
}

float calculateGeometrySmith(vec3 normal, vec3 w_i, vec3 w_o, float k) {
  return calculateGeometrySchlick(normal, w_i, k) * calculateGeometrySchlick(normal, w_o, k);
}

vec3 calculateFresnelSchlick(vec3 w_i, vec3 w_o, vec3 F0) {
  vec3 h = normalize(w_i + w_o);
  float VoH = max(dot(w_o, h), 0.0);
  return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

vec3 calculateSpecularBRDF(vec3 albedo, vec3 normal, vec3 w_o, vec3 w_i, float roughness, float metallic, vec3 F0) {
  float k = ((roughness + 1.0) * (roughness + 1.0)) / 8.0;
  
  float D = calculateDistributionGGX(normal, normalize(w_i + w_o), roughness);
  vec3 F = calculateFresnelSchlick(w_i, w_o, F0);
  float G = calculateGeometrySmith(normal, w_i, w_o, k);

  return  vec3((D * G) / (4.0 * max(dot(w_o, normal), 0.00001) * max(dot(w_i, normal), 0.00001)));
}

vec3 calculateBRDF(PointLight light, vec3 position, vec3 normal, vec3 w_o, float roughness, float metallic, vec3 albedo) {
  vec3 w_i = normalize(light.pos - position);
  vec3 F0 = mix(vec3(0.04), albedo, metallic);
  vec3 kS = calculateFresnelSchlick(w_i, w_o, F0);
  vec3 specularBRDF = kS * calculateSpecularBRDF(albedo, normal, w_o, w_i, roughness, metallic, F0);
  vec3 diffuseBRDF = (vec3(1.0) - kS) * calculateDiffuseBRDF(albedo) * (1.0 - metallic);

  return (diffuseBRDF + specularBRDF) * calculatePointLight(light, position) * max(dot(normal, w_i), 0.0);
}

void main()
{
  // **DO NOT** forget to do all your computation in linear space.
  vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;

  vec3 w_o = normalize(ViewDirectionWS);
  vec3 normal = normalize(vNormalWS);

  vec3 irradiance = vec3(0.0);

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    
    PointLight light;
    light.pos = vec3(
      uLightPositions[i * 3],
      uLightPositions[i * 3 + 1],
      uLightPositions[i * 3 + 2]
    );
    light.color = vec3(
      uLightColors[i * 3],
      uLightColors[i * 3 + 1],
      uLightColors[i * 3 + 2]
    );
    light.intensity = uLightIntensities[i];

    irradiance += calculateBRDF(light, vPositionWS, normal, w_o, roughness, metallic, albedo);
  }

  irradiance = tonemap(irradiance);
  outFragColor = LinearTosRGB(vec4(irradiance, 1.0));
}
`;
