import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Sales"
      subtitle="Trends"
      summary="Sales trend and mix, by route, rep and item."
      bullets={[
        "Daily, weekly and monthly comparison",
        "Top items and top customers",
        "Margin by route and by rep"
      ]}
    />
  );
}
