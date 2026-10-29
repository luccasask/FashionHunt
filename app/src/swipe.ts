export function swipeDecision(distance: number, width: number, velocity: number): 'like' | 'pass' | null {
  const threshold = Math.min(100, width * 0.25);
  const flick = Math.abs(distance) >= 35 && Math.abs(velocity) >= 0.6 && Math.sign(distance) === Math.sign(velocity);
  if (Math.abs(distance) < threshold && !flick) return null;
  return distance > 0 ? 'like' : 'pass';
}

export function swipeExitDistance(viewportWidth: number, cardWidth: number): number {
  // Move the entire card beyond the viewport, including its rotated corners.
  return viewportWidth + cardWidth;
}
