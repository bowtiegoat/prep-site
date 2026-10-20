// Career cluster colors, matching the role play tiles on thebowtiegoat.com.
// darkText: use dark text on this color (the yellow).

export const CLUSTER_COLORS = {
  'Marketing': { bg: '#A8323A' },
  'Finance': { bg: '#2E7D4F' },
  'Hospitality and Tourism': { bg: '#1F5F8B' },
  'Business Management and Administration': { bg: '#E3B23C', darkText: true },
  'Entrepreneurship': { bg: '#5F6670' },
  'Personal Financial Literacy': { bg: '#52913A' },
  // Principles events. Site navy until a cluster color is chosen.
  'Business Administration Core': { bg: '#141a2e' },
};

export function clusterColor(cluster) {
  return CLUSTER_COLORS[cluster] || { bg: '#141a2e' };
}
