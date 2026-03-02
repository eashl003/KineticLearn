/**
 * Convert a normalized MediaPipe landmark (0..1) to screen pixel coordinates
 * relative to the page, accounting for the container's position and mirroring.
 *
 * MediaPipe landmarks are normalized to the video frame:
 *   x: 0 (left of frame) to 1 (right of frame)
 *   y: 0 (top) to 1 (bottom)
 *
 * Selfie/user-facing cameras are mirrored in CSS (scaleX(-1)).
 * When mirrored=true we flip x so the user's right hand appears on-screen right.
 */
export function landmarkToScreen(
  landmark: { x: number; y: number },
  containerRect: DOMRect,
  mirrored = true,
): { x: number; y: number } {
  const nx = mirrored ? 1 - landmark.x : landmark.x;
  return {
    x: containerRect.left + nx * containerRect.width,
    y: containerRect.top + landmark.y * containerRect.height,
  };
}

/**
 * Given screen-space fingertip coordinates and an array of bubble elements,
 * find the index of the closest bubble within `maxDistance` pixels.
 * Returns -1 if none are close enough.
 */
export function findClosestBubble(
  fingertip: { x: number; y: number },
  bubbleElements: HTMLElement[],
  maxDistance = 80,
): number {
  let closest = -1;
  let minDist = Infinity;

  for (let i = 0; i < bubbleElements.length; i++) {
    const rect = bubbleElements[i].getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(fingertip.x - cx, fingertip.y - cy);
    if (dist < minDist && dist < maxDistance) {
      minDist = dist;
      closest = i;
    }
  }

  return closest;
}
