/**
 * Simple K-Means clustering for hotspot analysis.
 */

export function clusterEvents(events, k) {
  if (!events || events.length === 0 || k <= 0) return [];
  
  const validEvents = events.filter(e => typeof e.px === 'number' && typeof e.py === 'number' && !isNaN(e.px) && !isNaN(e.py));
  if (validEvents.length === 0) return [];

  // Use a subset if there are too many events for performance
  const maxPoints = 2000;
  const points = validEvents.length > maxPoints 
    ? validEvents.filter((_, i) => i % Math.ceil(validEvents.length / maxPoints) === 0)
    : validEvents;

  // Initialize centroids randomly from points
  let centroids = [];
  const usedIndices = new Set();
  while (centroids.length < Math.min(k, points.length)) {
    const idx = Math.floor(Math.random() * points.length);
    if (!usedIndices.has(idx)) {
      centroids.push({ x: points[idx].px, y: points[idx].py, count: 0 });
      usedIndices.add(idx);
    }
  }

  const iterations = 5;
  for (let iter = 0; iter < iterations; iter++) {
    // Assignment
    centroids.forEach(c => c.count = 0);
    const clusters = centroids.map(() => ({ sumX: 0, sumY: 0, count: 0 }));

    points.forEach(p => {
      let minDist = Infinity;
      let closestIdx = 0;
      centroids.forEach((c, i) => {
        const d = Math.pow(p.px - c.x, 2) + Math.pow(p.py - c.y, 2);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      });
      clusters[closestIdx].sumX += p.px;
      clusters[closestIdx].sumY += p.py;
      clusters[closestIdx].count++;
    });

    // Update
    centroids = clusters.map((cl, i) => {
      if (cl.count === 0) return centroids[i];
      return {
        x: cl.sumX / cl.count,
        y: cl.sumY / cl.count,
        count: cl.count
      };
    });
  }

  // Filter out empty or very small clusters
  return centroids.filter(c => c.count > points.length * 0.01).map(c => ({
    ...c,
    // Scale count back up if we subsampled
    displayCount: Math.round(c.count * (events.length / points.length))
  }));
}
