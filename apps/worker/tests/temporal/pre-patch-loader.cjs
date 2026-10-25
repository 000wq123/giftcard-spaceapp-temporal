/**
 * Reproduce the pre-patch supervisor for legacy cases and synthetic history recording.
 * All Temporal APIs remain real; the replay gate always uses the unmodified current bundle.
 */
module.exports = function (source) {
  const marker = 'patched("room-background-continuation-v1")';
  if (source.split(marker).length !== 2) throw new Error("Supervisor baseline changed; review the pre-patch recorder");
  return source.replace(marker, "false");
};
