// Recording only: reproduce the code before the supervisor patch was introduced.
// All Temporal APIs remain real. Never use this loader for the replay gate.
module.exports = function (source) {
  const marker = 'patched("room-background-continuation-v1")';
  if (source.split(marker).length !== 2) throw new Error("Supervisor baseline changed; review the pre-patch recorder");
  return source.replace(marker, "false");
};
