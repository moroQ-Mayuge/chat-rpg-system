import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import WorldsPage from './pages/WorldsPage.jsx';
import PropsPage from './pages/PropsPage.jsx';
import RoomTemplatesPage from './pages/RoomTemplatesPage.jsx';
import RoomTemplateEditPage from './pages/RoomTemplateEditPage.jsx';
import RoomWorldConfigPage from './pages/RoomWorldConfigPage.jsx';
import CharactersPage from './pages/CharactersPage.jsx';
import ExpressionTypesPage from './pages/ExpressionTypesPage.jsx';
import PoseMastersPage from './pages/PoseMastersPage.jsx';
import RelationshipAxesPage from './pages/RelationshipAxesPage.jsx';
import EventsPage from './pages/EventsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ModelEvalPage from './pages/ModelEvalPage.jsx';
import PlaythroughsPage from './pages/PlaythroughsPage.jsx';
import RoomPickerPage from './pages/RoomPickerPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ItemsPage from './pages/ItemsPage.jsx';
import ActionCommandsPage from './pages/ActionCommandsPage.jsx';
import SessionHistoryPage from './pages/SessionHistoryPage.jsx';
import SessionLogPage from './pages/SessionLogPage.jsx';
import CharacterStatusesPage from './pages/CharacterStatusesPage.jsx';
import OutfitMastersPage from './pages/OutfitMastersPage.jsx';
import MobFlavorPresetsPage from './pages/MobFlavorPresetsPage.jsx';

// Link spacing lives in global.css (.app-nav a) so the phone-width menu can
// override it; only the active-page weight stays inline.
const navLinkStyle = ({ isActive }) => ({
  fontWeight: isActive ? 700 : 400,
});

export default function App() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Chat is the app's primary content surface — while on it, drop the
  // shared page container's padding/max-width and let it fill the rest of
  // the viewport height instead of flowing with the document.
  const isChatPage = /^\/room-sessions\/[^/]+\/chat$/.test(location.pathname);

  // Phone-width menu: close it after navigating.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className={isChatPage ? 'app-root-chat' : undefined} style={{ fontFamily: 'sans-serif' }}>
      <header className="app-header">
        <div className="app-header-bar">
          <h1>ChatRPG</h1>
          <button
            type="button"
            className="app-nav-toggle"
            aria-expanded={navOpen}
            aria-controls="app-nav"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? '✕ 閉じる' : '☰ メニュー'}
          </button>
        </div>
        <nav id="app-nav" className={navOpen ? 'app-nav open' : 'app-nav'}>
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
          <NavLink to="/action-commands" style={navLinkStyle}>
            行動コマンド
          </NavLink>
          <NavLink to="/characters" style={navLinkStyle}>
            キャラクター
          </NavLink>
          <NavLink to="/expression-types" style={navLinkStyle}>
            表情マスター
          </NavLink>
          <NavLink to="/pose-masters" style={navLinkStyle}>
            ポーズマスタ
          </NavLink>
          <NavLink to="/relationship-axes" style={navLinkStyle}>
            関係性軸
          </NavLink>
          <NavLink to="/character-statuses" style={navLinkStyle}>
            キャラ状態
          </NavLink>
          <NavLink to="/outfit-masters" style={navLinkStyle}>
            衣装マスタ
          </NavLink>
          <NavLink to="/mob-flavor-presets" style={navLinkStyle}>
            モブペルソナ
          </NavLink>
          <NavLink to="/events" style={navLinkStyle}>
            イベント
          </NavLink>
          <NavLink to="/model-eval" style={navLinkStyle}>
            モデル評価
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
          <Route path="/rooms/:id/worlds/:worldId" element={<RoomWorldConfigPage />} />
          <Route path="/props" element={<PropsPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/action-commands" element={<ActionCommandsPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/expression-types" element={<ExpressionTypesPage />} />
          <Route path="/pose-masters" element={<PoseMastersPage />} />
          <Route path="/relationship-axes" element={<RelationshipAxesPage />} />
          <Route path="/character-statuses" element={<CharacterStatusesPage />} />
          <Route path="/outfit-masters" element={<OutfitMastersPage />} />
          <Route path="/mob-flavor-presets" element={<MobFlavorPresetsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/model-eval" element={<ModelEvalPage />} />
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
