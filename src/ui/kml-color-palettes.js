export const KML_COLOR_PALETTES = Object.freeze([
  {
    id: 'terrain',
    name: '森野地貌',
    colors: ['#0f766e', '#15803d', '#4d7c0f', '#a16207', '#c2410c', '#9a3412', '#475569', '#0e7490'],
  },
  {
    id: 'coast',
    name: '海岸晴空',
    colors: ['#075985', '#0369a1', '#0284c7', '#0891b2', '#0d9488', '#2563eb', '#4f46e5', '#6d28d9'],
  },
  {
    id: 'sunset',
    name: '暖霞人文',
    colors: ['#9f1239', '#be123c', '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#a21caf', '#7c2d12'],
  },
  {
    id: 'categorical',
    name: '均衡分类',
    colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#4b5563'],
  },
].map(group => Object.freeze({ ...group, colors: Object.freeze(group.colors) })))
