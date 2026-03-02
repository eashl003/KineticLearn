const PREFIX = '[Camera]';

export async function startCamera(
  videoEl: HTMLVideoElement,
): Promise<MediaStream> {
  console.log(`${PREFIX} Requesting getUserMedia (640x480, user-facing)...`);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
  });

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  console.log(`${PREFIX} Camera stream acquired`);
  console.log(`${PREFIX}   Track:      ${track.label}`);
  console.log(`${PREFIX}   Resolution: ${settings.width}x${settings.height}`);
  console.log(`${PREFIX}   Frame rate: ${settings.frameRate} fps`);
  console.log(`${PREFIX}   Facing:     ${settings.facingMode ?? 'unknown'}`);

  videoEl.srcObject = stream;
  console.log(`${PREFIX} Video element srcObject set`);

  return stream;
}

export function stopCamera(
  stream: MediaStream | null,
  animFrameId: number | null,
) {
  if (stream) {
    const trackCount = stream.getTracks().length;
    stream.getTracks().forEach((t) => t.stop());
    console.log(`${PREFIX} Stopped ${trackCount} track(s)`);
  }
  if (animFrameId != null) {
    cancelAnimationFrame(animFrameId);
    console.log(`${PREFIX} Cancelled animation frame ${animFrameId}`);
  }
}
