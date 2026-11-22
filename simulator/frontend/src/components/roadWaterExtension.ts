import { LayerExtension, type Layer } from '@deck.gl/core'

/**
 * Reuse the indexed street mesh for both the dry network and its water surface.
 * Depth edits upload a scalar pair per segment without retessellating geometries.
 */
class RoadWaterExtension extends LayerExtension {
  static extensionName = 'RoadWaterExtension'
  static defaultProps = { getWater: { type: 'accessor', value: [0, 0] } }

  initializeState(this: Layer) {
    this.getAttributeManager()?.addInstanced({ instanceRoadWater: { size: 2, accessor: 'getWater' } })
  }

  getShaders() {
    return {
      inject: {
        'vs:#decl': 'in vec2 instanceRoadWater; out vec2 roadWater;',
        'vs:DECKGL_FILTER_GL_POSITION': `
          roadWater = instanceRoadWater;
          if (roadWater.x > 0.0) {
            // Raise the ribbon by the modeled water depth in real meters.
            vec4 surface = geometry.position + vec4(0.0, 0.0, project_size(roadWater.x), 0.0);
            position = project_common_position_to_clipspace(surface);
          }
        `,
        'fs:#decl': 'in vec2 roadWater;',
        'fs:DECKGL_FILTER_COLOR': `
          if (roadWater.x > 0.0) {
            float across = geometry.uv.x;
            float deep = smoothstep(0.03, 0.85, roadWater.x);
            vec3 surface = mix(vec3(0.38, 0.76, 0.81), vec3(0.11, 0.48, 0.64), deep);
            float bank = smoothstep(0.62, 0.95, abs(across));
            // Faint fixed ripples resolve at street scale and disappear when subpixel.
            float wave = 2.6 * geometry.uv.y + 2.1 * across;
            float ripple = smoothstep(0.76, 1.0, sin(wave)) / (1.0 + fwidth(wave) * 2.0);
            color.rgb = mix(surface, vec3(0.77, 0.93, 0.94), 0.30 * bank + 0.12 * ripple);
            // Keep closures legible as a slim broken curb at close zoom. The water stays visible.
            float band = smoothstep(0.65, 0.86, abs(across));
            float ticks = smoothstep(-0.15, 0.2, sin(1.3 * geometry.uv.y));
            float detail = 1.0 - smoothstep(0.12, 0.6, fwidth(across));
            color.rgb = mix(color.rgb, vec3(0.98, 0.44, 0.35), roadWater.y * band * ticks * detail);
          }
        `,
      },
    }
  }
}

export const ROAD_WATER = new RoadWaterExtension()
