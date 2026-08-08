import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="New sales order"
      subtitle="Draft → approval"
      summary="Order taking at the customer, priced from the customer’s price list and soft-reserved for the team leader to approve."
      bullets={[
        "Scan or search items and set quantities",
        "Server-priced totals, same quote endpoint the van uses",
        "Submits as a draft Sales Order pending Team Leader approval"
      ]}
    />
  );
}
