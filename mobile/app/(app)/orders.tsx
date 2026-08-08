import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="My orders"
      subtitle="Pipeline"
      summary="The rep’s own orders tracked through approval, picking and delivery instead of chasing the back office."
      bullets={[
        "Sales Orders owned by this user with workflow state",
        "Filter by pending, approved, picking, delivered",
        "Drill into the order and its delivery status"
      ]}
    />
  );
}
