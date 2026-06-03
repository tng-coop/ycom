import WeatherRadar from './components/WeatherRadar';

export default function App() {
  return (
    <>
      {/* Background glow blobs */}
      <div className="bg-glow-1" />
      <div className="bg-glow-2" />

      <main className="welcome-container">
        <section className="glass-card">
          <div className="logo-container">
            Y
          </div>
          <h1>Hello from Ycom!</h1>
          <p className="subtitle">
            Welcome to the new system. We are initializing our components and integrations. Just saying hello for now!
          </p>

          <h2 className="section-title">Cooperative Ecosystem</h2>
          
          <div className="apps-grid">
            <div className="app-link-card">
              <span className="app-icon">🧩</span>
              <span className="app-name">Toy Hauptsatz</span>
              <span className="app-desc">Mathematical Proof Search</span>
            </div>
            
            <div className="app-link-card">
              <span className="app-icon">🗣️</span>
              <span className="app-name">HLM</span>
              <span className="app-desc">Human Language Model</span>
            </div>
            
            <div className="app-link-card">
              <span className="app-icon">🏢</span>
              <span className="app-name">KK-System</span>
              <span className="app-desc">Capital Management</span>
            </div>
          </div>
        </section>

        <WeatherRadar />

        <footer style={{ textAlign: 'center', marginTop: '2rem' }}>
          &copy; 2026 YCOM &bull; ALL SYSTEMS OPERATIONAL
        </footer>
      </main>
    </>
  );
}
