import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Alerts"
      subtitle="Exceptions"
      summary="Exceptions that need a decision, each with a clock rather than an open-ended list."
      bullets={[
        "Negative stock positions past the clearing window",
        "Customers over credit limit and blocked transactions",
        "Orders stuck in approval or picking"
      ]}
    />
  );
}
