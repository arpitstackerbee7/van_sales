import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Dashboard"
      subtitle="Live"
      summary="Management figures read live from the same ledgers the accounts team closes on, with no nightly rollup."
      bullets={[
        "Sales, gross margin, receivables and stock value",
        "Van and driver performance for the day",
        "Drill from any tile into the documents behind it"
      ]}
    />
  );
}
