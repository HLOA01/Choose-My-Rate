/** Internal normalization provenance, not source authentication or policy approval.
 * Old stored rows cannot distinguish defaults from source metadata. Never relabel them.
 */
export const PRMG_TRANSFORM_VERSION = 'prmg-normalizer-v3';
export function hasServablePrmgProvenance(summary: unknown): boolean {
  return summary !== null && typeof summary === 'object' && !Array.isArray(summary)
    && Object.prototype.hasOwnProperty.call(summary, 'transformVersion')
    && (summary as Record<string, unknown>).transformVersion === 'prmg-normalizer-v3';
}
