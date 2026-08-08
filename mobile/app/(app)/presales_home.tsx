import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="My day"
      subtitle="Allocated customers"
      summary="The rep’s allocated customers for the day, each showing what they already owe before the visit starts."
      bullets={[
        "List allocated customers from the Sales Team allocation, ordered by visit due date",
        "Show outstanding and days overdue on every row",
        "Open straight into a new sales order or a collection"
      ]}
    />
  );
}
