import { useState, useEffect } from 'react';
import React from 'react';
import CourtSync from './CourtSync';
import Login from './components/Login';

// ── ERROR BOUNDARY ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'sans-serif',
          gap: 16
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </div>
          <div style={{ 
            fontSize: 13, color: '#666', 
            maxWidth: 400, textAlign: 'center',
            wordBreak: 'break-word'
          }}>
            {this.state.error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: '#1A2E5E',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Refresh App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── SCHEMA MIGRATION ──────────────────────────────────────────────────────────
const SCHEMA_VERSION = '2'

function migrateSchema() {
  try {
    const savedVersion = localStorage.getItem('lextgress_schema_version')
    if (savedVersion !== SCHEMA_VERSION) {
      const raw = localStorage.getItem('lextgress_cases')
      if (raw) {
        const cases = JSON.parse(raw)
        const migrated = cases.map((c: any) => ({
          ...c,
          judgmentOrders: c.judgmentOrders || [],
          earlierCourtDetails: c.earlierCourtDetails || [],
          listingDates: c.listingDates || [],
          interlocutoryApplications: c.interlocutoryApplications || [],
          notices: c.notices || [],
          decisionDate: c.decisionDate || null,
          mcpData: c.mcpData || null,
        }))
        localStorage.setItem('lextgress_cases', JSON.stringify(migrated))
      }
      localStorage.setItem('lextgress_schema_version', SCHEMA_VERSION)
    }
  } catch (e) {
    console.warn('Migration failed:', e)
  }
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    migrateSchema()
    const user = localStorage.getItem('lextgress_user');
    if (user) {
      setIsLoggedIn(true);
    }
  }, []);

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <ErrorBoundary>
      <CourtSync />
    </ErrorBoundary>
  );
}

export default App;
