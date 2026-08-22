/**
 * Vignette + film grain + a light warm-highlights/cool-shadows split tone —
 * meant to run AFTER an OutputPass: these are display-referred "camera"
 * effects (acting on the final tonemapped image, the way they would on an
 * actual photo), not scene-linear lighting effects like SSAO/bloom. Shared
 * between the compose app's pipeline (renderBackend.js) and the landing
 * hero preview (landing-preview.js) so both get the same "photographed"
 * look rather than the hero reading as a different renderer.
 */
export const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignetteStrength: { value: 0.42 },
    grainStrength: { value: 0.028 },
    contrast: { value: 1.05 },
    saturation: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteStrength;
    uniform float grainStrength;
    uniform float contrast;
    uniform float saturation;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Warm highlights / cool shadows split tone — subtle, sells the
      // "photographed" feel more than a flat exposure adjustment does.
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      vec3 warm = color.rgb * vec3(1.05, 1.0, 0.9);
      vec3 cool = color.rgb * vec3(0.93, 0.97, 1.05);
      vec3 toned = mix(cool, warm, smoothstep(0.15, 0.8, luma));
      color.rgb = mix(color.rgb, toned, 0.35);

      // Contrast (pivoting on mid-gray) + saturation.
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;
      float g = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(g), color.rgb, saturation);

      // Vignette.
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * vignetteStrength;
      color.rgb *= clamp(vig, 0.0, 1.0);

      // Film grain — animated (time-seeded), not a static baked texture.
      float grain = (rand(vUv * 1000.0 + time) - 0.5) * grainStrength;
      color.rgb += grain;

      gl_FragColor = color;
    }
  `,
};
