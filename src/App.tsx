import WeatherRadar from './components/WeatherRadar';
import GPSPhotoBooth from './components/GPSPhotoBooth';

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
        </section>

        <GPSPhotoBooth />

        <WeatherRadar />

        <footer style={{ textAlign: 'center', marginTop: '2rem' }}>
          &copy; 2026 YCOM &bull; ALL SYSTEMS OPERATIONAL
        </footer>
      </main>
    </>
  );
}
