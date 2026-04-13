import { withMbtaKey } from './mbta-api-url.js';
import { parseFacility } from './mbta-parser.js';
import type { Facility, FacilityStatus, MbtaResource } from './types.js';

export function parseFacilityStatusFromApi(
  apiResponse: { data: MbtaResource[] },
): FacilityStatus[] {
  return apiResponse.data.map((resource) => {
    const properties = (resource.attributes.properties as { name: string; value: string }[]) ?? [];
    const statusProp = properties.find((p) => p.name === 'status');
    const updatedProp = properties.find((p) => p.name === 'updated-at');
    return {
      facilityId: resource.id,
      status: statusProp?.value === 'OUT_OF_ORDER' ? 'OUT_OF_ORDER' : 'WORKING',
      updatedAt: updatedProp?.value ?? new Date().toISOString(),
    };
  });
}

export class FacilityPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private apiKey: string;
  private onFacilities: (facilities: Facility[]) => void;
  private onStatuses: (statuses: FacilityStatus[]) => void;
  private onError: (error: unknown) => void;

  constructor(options: {
    apiKey: string;
    onFacilities: (facilities: Facility[]) => void;
    onStatuses: (statuses: FacilityStatus[]) => void;
    onError: (error: unknown) => void;
  }) {
    this.apiKey = options.apiKey;
    this.onFacilities = options.onFacilities;
    this.onStatuses = options.onStatuses;
    this.onError = options.onError;
  }

  start(intervalMs: number = 60_000): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  private async poll(): Promise<void> {
    try {
      const response = await fetch(
        withMbtaKey(
          'https://api-v3.mbta.com/facilities?filter[type]=ELEVATOR,ESCALATOR',
          this.apiKey,
        ),
      );
      if (!response.ok) {
        this.onError(new Error(`Facilities API returned ${response.status}`));
        return;
      }
      const json = await response.json();
      const data = json.data ?? [];
      const facilities = data.map((r: MbtaResource) => parseFacility(r)).filter(Boolean);
      const statuses = parseFacilityStatusFromApi({ data });
      this.onFacilities(facilities);
      this.onStatuses(statuses);
    } catch (err) { this.onError(err); }
  }
}
