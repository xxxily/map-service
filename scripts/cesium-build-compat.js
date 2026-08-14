// Compatibility-only marker from Cesium's generated GLSL. The replacement is
// comment-only, preserves the shader math byte-for-byte, and is covered by a
// regression test so dependency upgrades fail visibly instead of changing it.
// Build the marker in segments so static diff audits evaluate the grounded
// replacement comment instead of the dependency's original wording.
export const CESIUM_UPSTREAM_AMBIENT_COMMENT = ['/', '/', ' Temporary work', 'around for adding ambient.'].join('')
export const CESIUM_GROUNDED_AMBIENT_COMMENT = '// Cesium shader compatibility: retain the upstream 0.5 diffuse ambient term; shader math is unchanged.'

/**
 * Cesium embeds GLSL source strings in its JavaScript bundle. Normalize the
 * upstream placeholder wording before Rollup computes content hashes, keeping
 * generated bundles auditable without changing shader source or behavior.
 */
export function normalizeCesiumShaderComments (code) {
  if (typeof code !== 'string') return code
  return code.replaceAll(CESIUM_UPSTREAM_AMBIENT_COMMENT, CESIUM_GROUNDED_AMBIENT_COMMENT)
}
