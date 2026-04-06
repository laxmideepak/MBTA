import { describe, it, expect } from 'vitest';
import { parseFacilityStatusFromApi } from '../src/facility-poller.js';

describe('parseFacilityStatusFromApi', () => {
  it('parses live facility data into FacilityStatus array', () => {
    const apiResponse = {
      data: [{
        type: 'facility', id: 'facility-123',
        attributes: {
          long_name: 'Park Street Elevator', short_name: 'Elevator',
          type: 'ELEVATOR',
          properties: [
            { name: 'status', value: 'WORKING' },
            { name: 'updated-at', value: '2026-04-06T12:00:00-04:00' },
          ],
          latitude: null, longitude: null,
        },
        relationships: { stop: { data: { type: 'stop', id: 'place-pktrm' } } },
      }],
    };
    const statuses = parseFacilityStatusFromApi(apiResponse);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].facilityId).toBe('facility-123');
    expect(statuses[0].status).toBe('WORKING');
  });

  it('defaults to WORKING when no status property exists', () => {
    const apiResponse = {
      data: [{
        type: 'facility', id: 'facility-456',
        attributes: {
          long_name: 'Escalator', short_name: 'Escalator',
          type: 'ESCALATOR', properties: [],
          latitude: null, longitude: null,
        },
        relationships: { stop: { data: { type: 'stop', id: 'place-dwnxg' } } },
      }],
    };
    const statuses = parseFacilityStatusFromApi(apiResponse);
    expect(statuses[0].status).toBe('WORKING');
  });
});
