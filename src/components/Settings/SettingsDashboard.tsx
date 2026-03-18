import { useApp } from '../../AppContext';

export default function SettingsDashboard() {
    const { T } = useApp();

    return (
        <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto", width: "100%" }}>
            <div style={{ textAlign: "center", color: T.textMuted }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 12 }}>Settings</div>
                <div style={{ fontSize: 14 }}>This page is currently empty.</div>
            </div>
        </div>
    );
}
