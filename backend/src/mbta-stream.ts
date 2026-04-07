import EventSource from 'eventsource';
import { parseVehicle, parsePrediction, parseAlert } from './mbta-parser.js';
import type { Vehicle, Prediction, Alert } from './types.js';

export type StreamEvent<T> =
  | { type: 'reset'; data: T[] }
  | { type: 'add'; data: T }
  | { type: 'update'; data: T }
  | { type: 'remove'; id: string };

interface StreamOptions {
  apiKey: string;
  onVehicleEvent: (event: StreamEvent<Vehicle>) => void;
  onPredictionEvent: (event: StreamEvent<Prediction>) => void;
  onAlertEvent: (event: StreamEvent<Alert>) => void;
  onError: (source: string, error: unknown) => void;
}

export class MbtaStream {
  private sources: EventSource[] = [];
  private options: StreamOptions;

  constructor(options: StreamOptions) {
    this.options = options;
  }

  start(): void {
    this.connectVehicles();
    this.connectPredictions();
    this.connectAlerts();
  }

  stop(): void {
    for (const source of this.sources) source.close();
    this.sources = [];
  }

  private connectVehicles(): void {
    const url = `https://api-v3.mbta.com/vehicles?filter[route_type]=0,1&api_key=${this.options.apiKey}`;
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
    this.attachHandlers(es, 'vehicles', (r) => parseVehicle(r), this.options.onVehicleEvent);
    this.sources.push(es);
  }

  private connectPredictions(): void {
    const url = `https://api-v3.mbta.com/predictions?filter[route]=Red,Orange,Blue,Green-B,Green-C,Green-D,Green-E,Mattapan&api_key=${this.options.apiKey}`;
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
    this.attachHandlers(es, 'predictions', (r) => parsePrediction(r), this.options.onPredictionEvent);
    this.sources.push(es);
  }

  private connectAlerts(): void {
    const url = `https://api-v3.mbta.com/alerts?filter[route_type]=0,1&api_key=${this.options.apiKey}`;
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
    this.attachHandlers(es, 'alerts', (r) => parseAlert(r), this.options.onAlertEvent);
    this.sources.push(es);
  }

  private attachHandlers<T>(
    es: EventSource, label: string,
    parse: (resource: any) => T | null,
    emit: (event: StreamEvent<T>) => void,
  ): void {
    es.addEventListener('reset', (e: MessageEvent) => {
      try {
        const json = JSON.parse(e.data);
        const items = Array.isArray(json) ? json : json.data ?? [json];
        const parsed = (Array.isArray(items) ? items : [items]).map(parse).filter((x): x is T => x !== null);
        emit({ type: 'reset', data: parsed });
      } catch (err) {
        this.options.onError(label, err);
      }
    });

    es.addEventListener('add', (e: MessageEvent) => {
      try {
        const json = JSON.parse(e.data);
        const resource = json.data ?? json;
        const result = parse(resource);
        if (result !== null) {
          emit({ type: 'add', data: result });
        }
      } catch (err) {
        this.options.onError(label, err);
      }
    });

    es.addEventListener('update', (e: MessageEvent) => {
      try {
        const json = JSON.parse(e.data);
        const resource = json.data ?? json;
        const result = parse(resource);
        if (result !== null) {
          emit({ type: 'update', data: result });
        }
      } catch (err) {
        this.options.onError(label, err);
      }
    });

    es.addEventListener('remove', (e: MessageEvent) => {
      try {
        const json = JSON.parse(e.data);
        const id = json.data?.id ?? json.id ?? '';
        emit({ type: 'remove', id });
      } catch (err) {
        this.options.onError(label, err);
      }
    });

    es.onerror = (err) => this.options.onError(label, err);
  }
}
