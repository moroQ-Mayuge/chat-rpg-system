import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import WorldsPage from './pages/WorldsPage.jsx';
import PropsPage from './pages/PropsPage.jsx';
import RoomTemplatesPage from './pages/RoomTemplatesPage.jsx';
import RoomTemplateEditPage from './pages/RoomTemplateEditPage.jsx';
import CharactersPage from './pages/CharactersPage.jsx';
import ExpressionTypesPage from './pages/ExpressionTypesPage.jsx';
import RelationshipAxesPage from './pages/RelationshipAxesPage.jsx';
import EventsPage from './pages/EventsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PlaythroughsPage from './pages/PlaythroughsPage.jsx';
import RoomPickerPage from './pages/RoomPickerPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ItemsPage from './pages/ItemsPage.jsx';
import SessionHistoryPage from './pages/SessionHistoryPage.jsx';
import SessionLogPage from './pages/SessionLogPage.jsx';

const navLinkStyle = ({ isActive }) => ({
  fontWeight: isActive ? 700 : 400,
  marginRight: 16,
});

export default function App() {
  const location = useLocation();
  // Chat is the app's primary content surface — while on it, drop the
  // shared page container's padding/max-width and let it fill the rest of
  // the viewport height instead of flowing with the document.
  const isChatPage = /^\/room-sessions\/[^/]+\/chat$/.test(location.pathname);

  return (
    <div style={{ fontFamily: 'sans-serif', height: isChatPage ? '100vh' : 'auto', display: isChatPage ? 'flex' : 'block', flexDirection: 'column' }}>
      <header style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>ChatRPG</h1>
        <nav>
          <NavLink to="/worlds" style={navLinkStyle}>
            世界観
          </NavLink>
          <NavLink to="/rooms" style={navLinkStyle}>
            部屋
          </NavLink>
          <NavLink to="/props" style={navLinkStyle}>
            設備・機材
          </NavLink>
          <NavLink to="/items" style={navLinkStyle}>
            アイテム
          </NavLink>
          <NavLink to="/characters" style={navLinkStyle}>
            キャラクター
          </NavLink>
          <NavLink to="/expression-types" style={navLinkStyle}>
            表情マスター
          </NavLink>
          <NavLink to="/relationship-axes" style={navLinkStyle}>
            関係性軸
          </NavLink>
          <NavLink to="/events" style={navLinkStyle}>
            イベント
          </NavLink>
          <NavLink to="/settings" style={navLinkStyle}>
            設定
          </NavLink>
        </nav>
      </header>
      <main
        style={
          isChatPage
            ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
            : { padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }
        }
      >
        <Routes>
          <Route path="/" element={<RoomTemplatesPage />} />
          <Route path="/worlds" element={<WorldsPage />} />
          <Route path="/rooms" element={<RoomTemplatesPage />} />
          <Route path="/rooms/new" element={<RoomTemplateEditPage />} />
          <Route path="/rooms/:id/edit" element={<RoomTemplateEditPage />} />
          <Route path="/props" element={<PropsPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/expression-types" element={<ExpressionTypesPage />} />
          <Route path="/relationship-axes" element={<RelationshipAxesPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/worlds/:worldId/playthroughs" element={<PlaythroughsPage />} />
          <Route path="/playthroughs/:playthroughId/pick-room" element={<RoomPickerPage />} />
          <Route path="/playthroughs/:playthroughId/history" element={<SessionHistoryPage />} />
          <Route path="/room-sessions/:id/chat" element={<ChatPage />} />
          <Route path="/room-sessions/:id/log" element={<SessionLogPage />} />
        </Routes>
      </main>
    </div>
  );
}
