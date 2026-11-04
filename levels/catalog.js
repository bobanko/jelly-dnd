// Campaign order. Map files remain JSON.
const catalog = {
  version: 1,
  standard: [
    '01-first-steps.json',
    '02-helping-hands.json',
    '03-true-colors.json',
    'hello-big-box.json',
    '04-through-the-rift.json',
    'coworking.json',
    'against-the-flow.json',
    'bodyguards.json',
    'crate-expectations.json',
    'collateral-damage.json',
    //"05-sunken-sanctum.json"
  ],
  extra: [
    {
      subcat: 'gem',
      levels: ['gem-barrel-express.json', 'gem-mine-lift.json', 'gem-crystal-sanctum.json'],
    },
    {
      subcat: 'claude',
      levels: [
        'claude-counterweight.json',
        'claude-ring-road.json',
        'claude-green-wave.json',
        'claude-crossfire.json',
        'claude-shooting-gallery.json',
      ],
    },
  ],
};
export const { version, standard, extra } = catalog;
