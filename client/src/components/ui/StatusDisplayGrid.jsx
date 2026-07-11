const LOCATIONS = [
  { key: 'strip', label: '参加者ストリップ' },
  { key: 'panel', label: '折りたたみパネル' },
  { key: 'chat_log', label: 'チャットログ（発言時点の値）' },
];

const CATEGORIES = [
  { key: 'self_stat', label: '自己ステータス' },
  { key: 'status', label: 'キャラ状態' },
  { key: 'relationship_stage', label: '関係ステージ' },
];

// 3(表示場所)×3(項目)のON/OFFマトリクス。worlds.status_display_settings /
// status_display_preferences のどちらも同じ形（{location: {category: bool}}）
// なので、同じコンポーネントをWorldsPage.jsx（上限）とSettingsPage.jsx
// （プレイヤー個人の絞り込み）の両方から使い回す。
export default function StatusDisplayGrid({ value, onChange }) {
  function toggle(location, category) {
    onChange({ ...value, [location]: { ...value[location], [category]: !value[location][category] } });
  }

  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          <th></th>
          {CATEGORIES.map((c) => (
            <th key={c.key} style={{ padding: '2px 10px', fontWeight: 400, color: '#888' }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {LOCATIONS.map((loc) => (
          <tr key={loc.key}>
            <td style={{ padding: '2px 10px 2px 0', color: '#888', whiteSpace: 'nowrap' }}>{loc.label}</td>
            {CATEGORIES.map((cat) => (
              <td key={cat.key} style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={value[loc.key][cat.key]} onChange={() => toggle(loc.key, cat.key)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
