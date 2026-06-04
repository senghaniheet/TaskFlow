import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 200,          // virtual users (adjusted for varied requests)
    duration: '5m',    // test duration
};

export default function () {
    const baseUrl = __ENV.API_URL || 'http://taskflow.local';
    const params = {
        headers: {
            'Host': __ENV.HEADERS_HOST || 'taskflow.local',
            'Content-Type': 'application/json',
        },
    };
    
    // 1. Health check endpoint
    http.get(`${baseUrl}/api/health`, params);
    sleep(0.5);

    // 2. Fetch Workspaces
    http.get(`${baseUrl}/api/workspaces`, params);
    sleep(1);

    // 3. Create a Workspace (generates POST traffic)
    const payload = JSON.stringify({
        name: `LoadTest-Workspace-${__VU}-${__ITER}`,
    });
    http.post(`${baseUrl}/api/workspaces`, payload, params);
    sleep(1);
}