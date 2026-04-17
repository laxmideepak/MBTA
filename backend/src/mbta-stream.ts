import EventSource from 'eventsource';
import { withMbtaKey } from './mbta-api-url.js';
import { parseAlert, parsePrediction, parseVehicle } from './mbta-parser.js';
import type { Alert, Prediction, Vehicle } from './types.js';

type StreamEvent<T> =
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
  private options: StreamOptions;
  private closed = false;
  private attempts: Record<'vehicles' | 'predictions' | 'alerts', number> = {
    vehicles: 0,
    predictions: 0,
    alerts: 0,
  };
  private sources: Partial<Record<'vehicles' | 'predictions' | 'alerts', EventSource>> = {};
  private pollIntervalIds: Partial<
    Record<'vehicles' | 'predictions' | 'alerts', ReturnType<typeof setInterval>>
  > = {};

  constructor(options: StreamOptions) {
    this.options = options;
  }

  start(): void {
    this.closed = false;
    if (this.options.apiKey) {
      this.connectVehicles();
      this.connectPredictions();
      this.connectAlerts();
    } else {
      // Streaming requires an API key. Fall back to polling so the app still works in dev.
      this.startPolling();
    }
  }

  stop(): void {
    this.closed = true;
    for (const source of Object.values(this.sources)) source?.close();
    this.sources = {};
    for (const id of Object.values(this.pollIntervalIds)) if (id) clearInterval(id);
    this.pollIntervalIds = {};
  }

  private startPolling(): void {
    const poll = async <T>(
      label: 'vehicles' | 'predictions' | 'alerts',
      url: string,
      parse: (resource: any) => T | null,
      emit: (event: StreamEvent<T>) => void,
    ) => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
        const parsed = items.map(parse).filter((x: T | null): x is T => x !== null);
        emit({ type: 'reset', data: parsed });
      } catch (err) {
        this.options.onError(label, err);
      }
    };

    const vehiclesUrl = 'https://api-v3.mbta.com/vehicles?filter[route_type]=0,1';
    const predictionsUrl =
      'https://api-v3.mbta.com/predictions?filter[route]=Red,Orange,Blue,Green-B,Green-C,Green-D,Green-E,Mattapan';
    const alertsUrl = 'https://api-v3.mbta.com/alerts?filter[route_type]=0,1';

    // First tick immediately, then repeat.
    void poll('vehicles', vehiclesUrl, (r) => parseVehicle(r), this.options.onVehicleEvent);
    void poll(
      'predictions',
      predictionsUrl,
      (r) => parsePrediction(r),
      this.options.onPredictionEvent,
    );
    void poll('alerts', alertsUrl, (r) => parseAlert(r), this.options.onAlertEvent);

    this.pollIntervalIds.vehicles = setInterval(() => {
      if (!this.closed)
        void poll('vehicles', vehiclesUrl, (r) => parseVehicle(r), this.options.onVehicleEvent);
    }, 4000);
    this.pollIntervalIds.predictions = setInterval(() => {
      if (!this.closed)
        void poll(
          'predictions',
          predictionsUrl,
          (r) => parsePrediction(r),
          this.options.onPredictionEvent,
        );
    }, 8000);
    this.pollIntervalIds.alerts = setInterval(() => {
      if (!this.closed)
        void poll('alerts', alertsUrl, (r) => parseAlert(r), this.options.onAlertEvent);
    }, 30000);
  }

  private connectVehicles(): void {
    const url = withMbtaKey(
      'https://api-v3.mbta.com/vehicles?filter[route_type]=0,1',
      this.options.apiKey,
    );
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
    this.sources.vehicles = es;
    this.attachHandlers(
      es,
      'vehicles',
      (r) => parseVehicle(r),
      this.options.onVehicleEvent,
      () => this.connectVehicles(),
    );
  }

  private connectPredictions(): void {
    const url = withMbtaKey(
      'https://api-v3.mbta.com/predictions?filter[route]=Red,Orange,Blue,Green-B,Green-C,Green-D,Green-E,Mattapan',
      this.options.apiKey,
    );
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
    this.sources.predictions = es;
    this.attachHandlers(
      es,
      'predictions',
      (r) => parsePrediction(r),
      this.options.onPredictionEvent,
      () => this.connectPredictions(),
    );
  }

  private connectAlerts(): void {
    const url = withMbtaKey(
      'https://api-v3.mbta.com/alerts?filter[route_type]=0,1',
      this.options.apiKey,
    );
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
    this.sources.alerts = es;
    this.attachHandlers(
      es,
      'alerts',
      (r) => parseAlert(r),
      this.options.onAlertEvent,
      () => this.connectAlerts(),
    );
  }

  private attachHandlers<T>(
    es: EventSource,
    label: 'vehicles' | 'predictions' | 'alerts',
    parse: (resource: any) => T | null,
    emit: (event: StreamEvent<T>) => void,
    reconnect: () => void,
  ): void {
    const scheduleReconnect = (err: unknown) => {
      this.options.onError(label, err);
      if (this.closed) return;
      const attempt = (this.attempts[label] ?? 0) + 1;
      this.attempts[label] = attempt;
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 30000);
      try {
        es.close();
      } catch {}
      setTimeout(() => {
        if (this.closed) return;
        reconnect();
      }, backoff);
    };

    es.addEventListener('reset', (e: MessageEvent) => {
      try {
        this.attempts[label] = 0;
        const json = JSON.parse(e.data);
        const items = Array.isArray(json) ? json : (json.data ?? [json]);
        const parsed = (Array.isArray(items) ? items : [items])
          .map(parse)
          .filter((x): x is T => x !== null);
        emit({ type: 'reset', data: parsed });
      } catch (err) {
        this.options.onError(label, err);
      }
    });

    es.addEventListener('add', (e: MessageEvent) => {
      try {
        this.attempts[label] = 0;
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
        this.attempts[label] = 0;
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
        this.attempts[label] = 0;
        const json = JSON.parse(e.data);
        const id = json.data?.id ?? json.id ?? '';
        emit({ type: 'remove', id });
      } catch (err) {
        this.options.onError(label, err);
      }
    });

    es.onerror = (err) => scheduleReconnect(err);
  }
}
