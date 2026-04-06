import type { Weather } from './types.js';

const NWS_FORECAST_URL = 'https://api.weather.gov/gridpoints/BOX/71,90/forecast/hourly';

export class WeatherPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onWeather: (weather: Weather | null) => void;
  private onError: (error: unknown) => void;

  constructor(options: {
    onWeather: (weather: Weather | null) => void;
    onError: (error: unknown) => void;
  }) {
    this.onWeather = options.onWeather;
    this.onError = options.onError;
  }

  start(intervalMs: number = 900_000): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  private async poll(): Promise<void> {
    try {
      const response = await fetch(NWS_FORECAST_URL, {
        headers: { 'User-Agent': 'BostonSubwayLive/1.0 (contact@example.com)' },
      });
      if (!response.ok) { this.onWeather(null); return; }
      const json = await response.json();
      const current = json.properties?.periods?.[0];
      if (!current) { this.onWeather(null); return; }
      this.onWeather({
        temperature: current.temperature,
        condition: current.shortForecast,
        icon: current.icon,
      });
    } catch (err) { this.onError(err); }
  }
}
