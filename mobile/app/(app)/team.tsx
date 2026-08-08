import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="My team"
      subtitle="Sales persons"
      summary="Team performance built from the Sales Person tree, so the subtree defines the team with no second hierarchy to maintain."
      bullets={[
        "Each rep’s orders, value and collection totals",
        "Drill from a rep into their orders and customers",
        "Compare against target from Target Detail"
      ]}
    />
  );
}
