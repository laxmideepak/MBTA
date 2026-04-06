import { type FC } from 'react';
import type { Weather } from '../types';

interface WeatherIndicatorProps { weather: Weather | null; }

const STORM_KEYWORDS = ['storm', 'thunder', 'rain', 'snow', 'sleet', 'ice', 'blizzard', 'hurricane', 'tornado'];

function isStormCondition(condition: string): boolean {
  return STORM_KEYWORDS.some((kw) => condition.toLowerCase().includes(kw));
}

function getWeatherEmoji(condition: string): string {
  const lower = condition.toLowerCase();
  if (lower.includes('thunder')) return '\u26C8';
  if (lower.includes('snow') || lower.includes('blizzard')) return '\uD83C\uDF28';
  if (lower.includes('rain') || lower.includes('sleet')) return '\uD83C\uDF27';
  if (lower.includes('ice')) return '\uD83E\uDDCA';
  return '\u26A0';
}

export const WeatherIndicator: FC<WeatherIndicatorProps> = ({ weather }) => {
  if (!weather || !isStormCondition(weather.condition)) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
      background: 'rgba(20, 20, 20, 0.9)', borderRadius: 8,
      border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: 13, color: '#ccc',
    }}>
      <span style={{ fontSize: 18 }}>{getWeatherEmoji(weather.condition)}</span>
      <span>{weather.condition} · {weather.temperature}°F</span>
    </div>
  );
};
