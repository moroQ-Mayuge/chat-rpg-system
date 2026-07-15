import { useState } from 'react';

// Shared by the sidebar-layout list+editor screens (Characters/Events/Items)
// to drive the mobile slide-out list pane (see .sidebar-layout in
// global.css). Not used by RoomTemplatesPage, which has no adjacent editor
// pane to make room for.
export function useMobileListToggle() {
  const [mobileListOpen, setMobileListOpen] = useState(false);
  return {
    mobileListOpen,
    openList: () => setMobileListOpen(true),
    closeList: () => setMobileListOpen(false),
  };
}
