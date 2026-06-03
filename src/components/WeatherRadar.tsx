import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Thermometer, 
  Wind, 
  Droplets, 
  CloudRain, 
  MapPin, 
  Navigation,
  Sun,
  Cloud,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Sliders,
  Calendar
} from 'lucide-react';

interface JmaTargetTime {
  basetime: string;
  validtime: string;
  elements: string[];
}

interface CurrentWeather {
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  precipitation: number;
  rain: number;
  weather_code: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  time: string;
}

interface HourlyData {
  time: string[];
  temperature_2m: number[];
  precipitation: number[];
}

export default function WeatherRadar() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const intervalRef = useRef<any>(null);

  // Coordinates for Yugawara, Japan
  const yugawaraCoords: [number, number] = [35.1462, 139.1023];

  // States
  const [targetTimes, setTargetTimes] = useState<JmaTargetTime[]>([]);
  const [activeTimeIndex, setActiveTimeIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.7);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [hourly, setHourly] = useState<HourlyData | null>(null);
  const [trendsTab, setTrendsTab] = useState<'past' | 'future'>('past');
  const [loadingRadar, setLoadingRadar] = useState<boolean>(true);
  const [loadingWeather, setLoadingWeather] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(600); // ms per frame

  // 1. Fetch current weather from Open-Meteo JMA MSM
  // 1. Fetch current weather from Open-Meteo JMA MSM
  const fetchWeather = async () => {
    setLoadingWeather(true);
    try {
      // Check if pre-hydrated by WordPress Block
      // @ts-ignore
      if (window.jwcuWeatherData && window.jwcuWeatherData.weather) {
        // @ts-ignore
        const data = window.jwcuWeatherData.weather;
        setWeather(data.current);
        setHourly(data.hourly);
        setLoadingWeather(false);
        return;
      }

      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${yugawaraCoords[0]}&longitude=${yugawaraCoords[1]}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,precipitation&past_days=1&forecast_days=1&models=jma_msm&timezone=Asia/Tokyo`
      );
      if (!res.ok) throw new Error('Failed to fetch weather data');
      const data = await res.json();
      setWeather(data.current);
      setHourly(data.hourly);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingWeather(false);
    }
  };

  // 2. Fetch JMA Nowcast Target Times
  const fetchTargetTimes = async () => {
    setLoadingRadar(true);
    try {
      // Check if pre-hydrated by WordPress Block
      // @ts-ignore
      if (window.jwcuWeatherData && window.jwcuWeatherData.radarN1) {
        // @ts-ignore
        const dataN1: JmaTargetTime[] = window.jwcuWeatherData.radarN1;
        // @ts-ignore
        const dataN2: JmaTargetTime[] = window.jwcuWeatherData.radarN2 || [];
        
        const pastFrames = dataN1.slice(0, 6).reverse();
        const futureFrames = [...dataN2].reverse();
        const combined = [...pastFrames, ...futureFrames];
        
        setTargetTimes(combined);
        setActiveTimeIndex(pastFrames.length > 0 ? pastFrames.length - 1 : 0);
        setLoadingRadar(false);
        return;
      }

      // Fetch past observations (N1)
      const resN1 = await fetch('https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json');
      if (!resN1.ok) throw new Error('Failed to fetch past radar timestamps');
      const dataN1: JmaTargetTime[] = await resN1.json();
      
      // Limit to past 6 frames (last 30 mins) for performance & smooth loop, chronological order
      const pastFrames = dataN1.slice(0, 6).reverse();
      
      // Fetch future forecasts (N2)
      let futureFrames: JmaTargetTime[] = [];
      try {
        const resN2 = await fetch('https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json');
        if (resN2.ok) {
          const dataN2: JmaTargetTime[] = await resN2.json();
          // N2 is sorted descending (furthest forecast first), reverse to make it chronological (closest forecast first)
          futureFrames = dataN2.reverse();
        }
      } catch (e) {
        console.warn("Could not load future radar forecast", e);
      }
      
      const combined = [...pastFrames, ...futureFrames];
      setTargetTimes(combined);
      // Start the active frame at the latest observation (index of the last element in pastFrames, which is 5)
      setActiveTimeIndex(pastFrames.length > 0 ? pastFrames.length - 1 : 0);
    } catch (err: any) {
      setError('Could not retrieve radar data. Using fallback timestamps.');
      console.error(err);
      
      // Fallback timestamps: construct past 6 intervals of 5 minutes in UTC
      const now = new Date();
      const fallbacks: JmaTargetTime[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 5 * 60 * 1000);
        // Round to nearest 5 minutes
        d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
        d.setSeconds(0);
        d.setMilliseconds(0);
        
        const pad = (n: number) => String(n).padStart(2, '0');
        const basetime = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
        fallbacks.push({
          basetime,
          validtime: basetime,
          elements: ['hrpns']
        });
      }
      setTargetTimes(fallbacks);
      setActiveTimeIndex(fallbacks.length - 1);
    } finally {
      setLoadingRadar(false);
    }
  };

  // Initial loads
  useEffect(() => {
    fetchWeather();
    fetchTargetTimes();
  }, []);

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up container to prevent React StrictMode "Map container is already initialized" error
    // @ts-ignore
    delete mapContainerRef.current._leaflet_id;
    mapContainerRef.current.innerHTML = '';

    // Create map centered on Yugawara
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 2,
      zoomDelta: 2
    }).setView(yugawaraCoords, 10);

    mapRef.current = map;

    // Add zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // CartoDB Dark Matter base map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Custom glowing pulse marker for Yugawara Station
    const glowingIcon = L.divIcon({
      html: `
        <div class="glow-marker-outer">
          <div class="glow-marker-pulse"></div>
          <div class="glow-marker-inner"></div>
        </div>
      `,
      className: 'custom-glowing-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker(yugawaraCoords, { icon: glowingIcon }).addTo(map);
    marker.bindPopup(`
      <div class="radar-popup">
        <h3>Yugawara, Kanagawa</h3>
        <p>Coordinates: 35.1462° N, 139.1023° E</p>
      </div>
    `);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 4. Update JMA Radar Tile Layer when activeTimeIndex or opacity changes
  const updateRadarLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map || targetTimes.length === 0) return;

    const activeFrame = targetTimes[activeTimeIndex];
    if (!activeFrame) return;

    const { basetime, validtime } = activeFrame;
    const radarTileUrl = `https://www.jma.go.jp/bosai/jmatile/data/nowc/${basetime}/none/${validtime}/surf/hrpns/{z}/{x}/{y}.png`;

    // Remove existing radar layer
    if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
    }

    // Add new radar layer
    const newRadarLayer = L.tileLayer(radarTileUrl, {
      opacity: opacity,
      maxZoom: 12,
      maxNativeZoom: 10,
      minZoom: 4,
      zIndex: 100,
      attribution: '気象データ &copy; 気象庁 (JMA Nowcast)'
    });

    newRadarLayer.addTo(map);
    radarLayerRef.current = newRadarLayer;
  }, [activeTimeIndex, targetTimes, opacity]);

  useEffect(() => {
    updateRadarLayer();
  }, [updateRadarLayer]);

  // 5. Play / Pause Loop Animation
  useEffect(() => {
    if (isPlaying && targetTimes.length > 0) {
      intervalRef.current = setInterval(() => {
        setActiveTimeIndex((prevIndex) => (prevIndex + 1) % targetTimes.length);
      }, playbackSpeed);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, targetTimes.length, playbackSpeed]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  // Convert UTC timestamp YYYYMMDDHHMMSS to local format (JST)
  const formatTime = (ts: string) => {
    if (ts.length < 12) return ts;
    const year = parseInt(ts.substring(0, 4));
    const month = parseInt(ts.substring(4, 6)) - 1;
    const day = parseInt(ts.substring(6, 8));
    const hour = parseInt(ts.substring(8, 10));
    const minute = parseInt(ts.substring(10, 12));

    const dateUtc = new Date(Date.UTC(year, month, day, hour, minute));

    return dateUtc.toLocaleTimeString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + ' JST';
  };

  // Map WMO Weather Codes to text & Lucide icon
  const getWeatherInfo = (code: number) => {
    const defaultInfo = { text: 'Unknown', icon: <Cloud className="w-8 h-8 text-blue-400" />, gradient: 'from-blue-600/20 to-indigo-600/5' };
    
    const mapping: Record<number, typeof defaultInfo> = {
      0: { text: 'Clear Sky', icon: <Sun className="w-8 h-8 text-amber-400" />, gradient: 'from-amber-500/20 to-orange-500/5' },
      1: { text: 'Mainly Clear', icon: <Sun className="w-8 h-8 text-amber-300" />, gradient: 'from-amber-500/15 to-blue-500/5' },
      2: { text: 'Partly Cloudy', icon: <Cloud className="w-8 h-8 text-gray-300" />, gradient: 'from-gray-500/15 to-blue-500/5' },
      3: { text: 'Overcast', icon: <Cloud className="w-8 h-8 text-gray-400" />, gradient: 'from-gray-600/20 to-slate-700/5' },
      45: { text: 'Foggy', icon: <CloudFog className="w-8 h-8 text-slate-400" />, gradient: 'from-slate-500/20 to-zinc-600/5' },
      48: { text: 'Rime Fog', icon: <CloudFog className="w-8 h-8 text-slate-300" />, gradient: 'from-slate-500/20 to-zinc-600/5' },
      51: { text: 'Light Drizzle', icon: <CloudRain className="w-8 h-8 text-sky-400" />, gradient: 'from-sky-500/15 to-indigo-500/5' },
      53: { text: 'Moderate Drizzle', icon: <CloudRain className="w-8 h-8 text-sky-400" />, gradient: 'from-sky-500/20 to-indigo-500/5' },
      55: { text: 'Dense Drizzle', icon: <CloudRain className="w-8 h-8 text-sky-500" />, gradient: 'from-sky-600/25 to-indigo-600/5' },
      61: { text: 'Slight Rain', icon: <CloudRain className="w-8 h-8 text-blue-400" />, gradient: 'from-blue-500/20 to-indigo-600/5' },
      63: { text: 'Moderate Rain', icon: <CloudRain className="w-8 h-8 text-blue-500" />, gradient: 'from-blue-600/25 to-indigo-600/5' },
      65: { text: 'Heavy Rain', icon: <CloudRain className="w-8 h-8 text-blue-600" />, gradient: 'from-blue-700/30 to-indigo-700/10' },
      80: { text: 'Light Showers', icon: <CloudRain className="w-8 h-8 text-sky-400" />, gradient: 'from-sky-500/20 to-indigo-500/5' },
      81: { text: 'Moderate Showers', icon: <CloudRain className="w-8 h-8 text-blue-400" />, gradient: 'from-blue-500/25 to-indigo-600/5' },
      82: { text: 'Violent Showers', icon: <CloudRain className="w-8 h-8 text-violet-500" />, gradient: 'from-violet-600/30 to-indigo-800/10' },
      95: { text: 'Thunderstorms', icon: <CloudLightning className="w-8 h-8 text-yellow-400" />, gradient: 'from-yellow-600/20 to-red-600/5' },
      96: { text: 'Thunderstorms with Hail', icon: <CloudLightning className="w-8 h-8 text-yellow-500" />, gradient: 'from-yellow-600/25 to-red-600/5' },
      99: { text: 'Heavy Thunderstorms', icon: <CloudLightning className="w-8 h-8 text-red-500" />, gradient: 'from-red-600/30 to-indigo-900/10' },
      71: { text: 'Slight Snow', icon: <CloudSnow className="w-8 h-8 text-sky-200" />, gradient: 'from-sky-300/15 to-slate-400/5' },
      73: { text: 'Moderate Snow', icon: <CloudSnow className="w-8 h-8 text-sky-100" />, gradient: 'from-sky-300/20 to-slate-400/5' },
      75: { text: 'Heavy Snow', icon: <CloudSnow className="w-8 h-8 text-white" />, gradient: 'from-sky-300/25 to-slate-400/5' },
    };

    return mapping[code] || defaultInfo;
  };

  const getPast24Data = () => {
    if (!hourly || !weather) return null;
    
    const currentHourStr = weather.time.substring(0, 13) + ':00';
    let idx = hourly.time.findIndex((t) => t.startsWith(currentHourStr));
    if (idx === -1) {
      idx = hourly.time.length - 1;
    }
    
    const startIndex = Math.max(0, idx - 23);
    const times = hourly.time.slice(startIndex, idx + 1);
    const temps = hourly.temperature_2m.slice(startIndex, idx + 1);
    const rains = hourly.precipitation.slice(startIndex, idx + 1);
    
    return { times, temps, rains };
  };

  const getFuture24Data = () => {
    if (!hourly || !weather) return null;
    
    const currentHourStr = weather.time.substring(0, 13) + ':00';
    let idx = hourly.time.findIndex((t) => t.startsWith(currentHourStr));
    if (idx === -1) {
      idx = 0;
    }
    
    const endIndex = Math.min(hourly.time.length, idx + 24);
    const times = hourly.time.slice(idx, endIndex);
    const temps = hourly.temperature_2m.slice(idx, endIndex);
    const rains = hourly.precipitation.slice(idx, endIndex);
    
    return { times, temps, rains };
  };

  const chartData = trendsTab === 'past' ? getPast24Data() : getFuture24Data();

  const weatherInfo = weather ? getWeatherInfo(weather.weather_code) : null;

  return (
    <section className="glass-card radar-hub-container">
      <div className="radar-hub-header">
        <div className="title-area">
          <div className="live-badge">
            <span className="live-dot"></span>
            LIVE RADAR
          </div>
          <h2>Yugawara Meteorological Center</h2>
          <p className="description">
            High-resolution JMA Meso-Scale weather forecast and active rain radar.
          </p>
        </div>
        <button 
          onClick={() => { fetchWeather(); fetchTargetTimes(); }}
          className={`refresh-btn ${loadingWeather || loadingRadar ? 'spinning' : ''}`}
          title="Refresh Data"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="radar-hub-grid">
        {/* LEFT COLUMN - INTERACTIVE RADAR MAP */}
        <div className="radar-map-column">
          <div className="map-wrapper">
            <div ref={mapContainerRef} className="leaflet-map-container" />
            
            {loadingRadar && (
              <div className="map-loader">
                <RefreshCw className="w-8 h-8 spinning text-blue-500" />
                <span>Loading Precipitation Radar...</span>
              </div>
            )}

            {/* Radar Map Overlay Timeline HUD */}
            {targetTimes.length > 0 && (
              <div className="map-hud-timeline">
                <div className="timeline-info">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="current-frame-time">
                    {formatTime(targetTimes[activeTimeIndex]?.validtime)}
                  </span>
                  <span className="frame-counter">
                    ({activeTimeIndex + 1}/{targetTimes.length})
                  </span>
                  {(() => {
                    const activeFrame = targetTimes[activeTimeIndex];
                    if (!activeFrame) return null;
                    const isFcst = activeFrame.basetime !== activeFrame.validtime;
                    return (
                      <span className={`hud-badge ${isFcst ? 'forecast' : 'observation'}`}>
                        {isFcst ? 'FORECAST' : 'OBSERVATION'}
                      </span>
                    );
                  })()}
                </div>
                <div className="timeline-scrubber">
                  {targetTimes.map((time, idx) => (
                    <button
                      key={time.validtime}
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveTimeIndex(idx);
                      }}
                      className={`timeline-tick ${idx === activeTimeIndex ? 'active' : ''}`}
                      title={formatTime(time.validtime)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Legend HUD */}
            <div className="map-legend-hud">
              <span className="legend-title">Rain Rate (mm/h)</span>
              <div className="legend-bar">
                <span style={{ backgroundColor: '#c0c0c0' }}>0</span>
                <span style={{ backgroundColor: '#a0d0ff' }}>1</span>
                <span style={{ backgroundColor: '#00a0ff' }}>5</span>
                <span style={{ backgroundColor: '#0020ff' }}>10</span>
                <span style={{ backgroundColor: '#f0f000' }}>20</span>
                <span style={{ backgroundColor: '#ff8000' }}>30</span>
                <span style={{ backgroundColor: '#ff0000' }}>50</span>
                <span style={{ backgroundColor: '#b000b0' }}>80+</span>
              </div>
            </div>
          </div>

          {/* Map Controls */}
          <div className="map-controls-panel">
            <div className="playback-controls">
              <button 
                onClick={togglePlay} 
                className={`play-btn ${isPlaying ? 'playing' : ''}`}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY LOOP'}</span>
              </button>
              
              <div className="speed-buttons">
                <button 
                  onClick={() => setPlaybackSpeed(800)} 
                  className={`speed-btn ${playbackSpeed === 800 ? 'active' : ''}`}
                >
                  0.5x
                </button>
                <button 
                  onClick={() => setPlaybackSpeed(500)} 
                  className={`speed-btn ${playbackSpeed === 500 ? 'active' : ''}`}
                >
                  1.0x
                </button>
                <button 
                  onClick={() => setPlaybackSpeed(300)} 
                  className={`speed-btn ${playbackSpeed === 300 ? 'active' : ''}`}
                >
                  1.5x
                </button>
              </div>
            </div>

            <div className="opacity-slider-container">
              <Sliders className="w-4 h-4 text-gray-400" />
              <label htmlFor="radar-opacity">Radar Opacity:</label>
              <input
                id="radar-opacity"
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
              />
              <span className="opacity-val">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - LIVE WEATHER DASHBOARD */}
        <div className="weather-dashboard-column">
          {loadingWeather ? (
            <div className="dashboard-loader">
              <RefreshCw className="w-8 h-8 spinning text-blue-500" />
              <span>Fetching Live Metrics...</span>
            </div>
          ) : weather ? (
            <>
              <div className="dashboard-grid">
                {/* Main Weather Card */}
                <div className={`dashboard-card main-condition bg-gradient-to-br ${weatherInfo?.gradient}`}>
                  <div className="condition-icon-box">
                    {weatherInfo?.icon}
                  </div>
                  <div className="condition-meta">
                    <span className="card-label">CURRENT WEATHER</span>
                    <span className="condition-text">{weatherInfo?.text}</span>
                    <div className="station-meta">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Yugawara Station AMeDAS</span>
                    </div>
                  </div>
                </div>

                {/* Temperature Card */}
                <div className="dashboard-card stat-card temp-glow">
                  <div className="card-icon-header">
                    <Thermometer className="w-5 h-5 text-red-400" />
                    <span className="card-label">TEMPERATURE</span>
                  </div>
                  <div className="value-display">
                    <span className="value">{weather.temperature_2m.toFixed(1)}</span>
                    <span className="unit">°C</span>
                  </div>
                  <div className="sub-value">
                    Feels like {weather.apparent_temperature.toFixed(1)}°C
                  </div>
                </div>

                {/* Precipitation Card */}
                <div className="dashboard-card stat-card rain-glow">
                  <div className="card-icon-header">
                    <CloudRain className="w-5 h-5 text-blue-400" />
                    <span className="card-label">RAIN RATE</span>
                  </div>
                  <div className="value-display">
                    <span className="value">{weather.rain.toFixed(2)}</span>
                    <span className="unit">mm/h</span>
                  </div>
                  <div className="sub-value">
                    Accumulation: {weather.precipitation.toFixed(1)} mm
                  </div>
                </div>

                {/* Humidity Card */}
                <div className="dashboard-card stat-card humidity-glow">
                  <div className="card-icon-header">
                    <Droplets className="w-5 h-5 text-sky-400" />
                    <span className="card-label">HUMIDITY</span>
                  </div>
                  <div className="value-display">
                    <span className="value">{weather.relative_humidity_2m}</span>
                    <span className="unit">%</span>
                  </div>
                  <div className="sub-value">
                    Dew Point: {(weather.temperature_2m - (100 - weather.relative_humidity_2m) / 5).toFixed(1)}°C
                  </div>
                </div>

                {/* Wind Card */}
                <div className="dashboard-card stat-card wind-glow">
                  <div className="card-icon-header">
                    <Wind className="w-5 h-5 text-teal-400" />
                    <span className="card-label">WIND SYSTEM</span>
                  </div>
                  <div className="value-display">
                    <span className="value">{weather.wind_speed_10m.toFixed(1)}</span>
                    <span className="unit">km/h</span>
                  </div>
                  <div className="wind-direction">
                    <Navigation 
                      className="w-4 h-4 text-teal-300"
                      style={{ transform: `rotate(${weather.wind_direction_10m}deg)` }}
                    />
                    <span>Bearing: {weather.wind_direction_10m}°</span>
                  </div>
                </div>
              </div>

              {/* Past / Future 24h Trends Card */}
              {chartData && (
                <div className="dashboard-card past-history-card">
                  <div className="card-icon-header" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="tab-buttons">
                      <button 
                        onClick={() => setTrendsTab('past')}
                        className={`tab-btn ${trendsTab === 'past' ? 'active' : ''}`}
                      >
                        PAST 24H (OBS)
                      </button>
                      <button 
                        onClick={() => setTrendsTab('future')}
                        className={`tab-btn ${trendsTab === 'future' ? 'active' : ''}`}
                      >
                        NEXT 24H (FCST)
                      </button>
                    </div>
                    <span className="card-label">{trendsTab === 'past' ? 'HISTORICAL TRENDS' : 'FORECAST TRENDS'}</span>
                  </div>
                  
                  <div className="sparkline-wrapper">
                    <svg viewBox="0 0 400 130" width="100%" height="130" className="history-svg">
                      <defs>
                        <linearGradient id="temp-line-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="1" />
                        </linearGradient>
                        <linearGradient id="temp-area-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      <line x1="25" y1="15" x2="385" y2="15" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                      <line x1="25" y1="62.5" x2="385" y2="62.5" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                      <line x1="25" y1="110" x2="385" y2="110" stroke="rgba(255,255,255,0.1)" />

                      {chartData.rains.map((rain, i) => {
                        const maxR = Math.max(...chartData.rains) || 1;
                        const barHeight = rain > 0 ? Math.max(2, (rain / maxR) * 60) : 0;
                        const x = 25 + (i * 360) / 23;
                        const y = 110 - barHeight;
                        if (rain === 0) return null;
                        return (
                          <rect
                            key={`bar-${i}`}
                            x={x - 3}
                            y={y}
                            width="6"
                            height={barHeight}
                            fill="#3b82f6"
                            opacity="0.6"
                            rx="1"
                          />
                        );
                      })}

                      <path
                        d={`
                          M 25 110
                          ${chartData.temps.map((temp, i) => {
                            const minT = Math.min(...chartData.temps);
                            const maxT = Math.max(...chartData.temps);
                            const tRange = (maxT - minT) || 1;
                            const x = 25 + (i * 360) / 23;
                            const y = 15 + 85 * (1 - (temp - minT) / tRange);
                            return `L ${x} ${y}`;
                          }).join(' ')}
                          L 385 110
                          Z
                        `}
                        fill="url(#temp-area-grad)"
                      />

                      <path
                        d={`
                          M 25 ${15 + 85 * (1 - (chartData.temps[0] - Math.min(...chartData.temps)) / ((Math.max(...chartData.temps) - Math.min(...chartData.temps)) || 1))}
                          ${chartData.temps.map((temp, i) => {
                            const minT = Math.min(...chartData.temps);
                            const maxT = Math.max(...chartData.temps);
                            const tRange = (maxT - minT) || 1;
                            const x = 25 + (i * 360) / 23;
                            const y = 15 + 85 * (1 - (temp - minT) / tRange);
                            return `L ${x} ${y}`;
                          }).join(' ')}
                        `}
                        fill="none"
                        stroke="url(#temp-line-grad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {chartData.temps.map((temp, i) => {
                        const minT = Math.min(...chartData.temps);
                        const maxT = Math.max(...chartData.temps);
                        const isMin = temp === minT;
                        const isMax = temp === maxT;
                        if (!isMin && !isMax) return null;
                        
                        const tRange = (maxT - minT) || 1;
                        const x = 25 + (i * 360) / 23;
                        const y = 15 + 85 * (1 - (temp - minT) / tRange);
                        return (
                          <g key={`dot-${i}`}>
                            <circle cx={x} cy={y} r="5" fill={isMax ? '#f59e0b' : '#ef4444'} stroke="white" strokeWidth="1" />
                            <text 
                              x={x} 
                              y={y - 8} 
                              fill="#ffffff" 
                              fontSize="8" 
                              fontWeight="bold" 
                              textAnchor="middle"
                              className="svg-label"
                            >
                              {temp.toFixed(1)}°
                            </text>
                          </g>
                        );
                      })}

                      {[0, 6, 12, 18, 23].map((idx) => {
                        const timeStr = chartData.times[idx];
                        if (!timeStr) return null;
                        const hr = timeStr.substring(11, 16);
                        const x = 25 + (idx * 360) / 23;
                        return (
                          <text
                            key={`lbl-${idx}`}
                            x={x}
                            y="124"
                            fill="rgba(156, 163, 175, 0.6)"
                            fontSize="8"
                            textAnchor="middle"
                          >
                            {hr}
                          </text>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="past-summary-analytics">
                    <div className="analytic-item">
                      <span className="label">Peak Rain:</span>
                      <span className="val text-blue-400 font-bold">
                        {Math.max(...chartData.rains) > 0 
                          ? `${Math.max(...chartData.rains).toFixed(1)} mm/h` 
                          : '0.0 mm/h'}
                      </span>
                    </div>
                    <div className="analytic-item">
                      <span className="label">Temp Range:</span>
                      <span className="val text-amber-400 font-bold">
                        {Math.min(...chartData.temps).toFixed(1)}°C - {Math.max(...chartData.temps).toFixed(1)}°C
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="error-state">Failed to load weather stats.</div>
          )}

          {/* Quick Town Info Box */}
          <div className="town-info-card">
            <h4>Yugawara Hot Springs Resort</h4>
            <p>
              Located in Kanagawa Prefecture, Yugawara sits in a valley facing Sagami Bay. 
              The local microclimate is highly influenced by surrounding mountains (Hakone caldera) 
              and ocean wind channels, creating localized precipitation bands visible on the radar.
            </p>
            <div className="attribution-footer" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '0.7rem', color: 'rgba(156, 163, 175, 0.4)', lineHeight: '1.4' }}>
              気象データは気象庁 (JMA) のモデルおよび降水ナウキャストに基づき、Open-Meteo API を経由して取得・補間されたデータを加工して表示しています。
              <br />
              Map tiles &copy; JMA Nowcast, CARTO, OpenStreetMap.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
