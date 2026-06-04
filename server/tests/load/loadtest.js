import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 2000,          // virtual users
    duration: '5m',   // test duration
};

export default function () {
    const url = __ENV.API_URL || 'http://taskflow.local/api/workspaces';
    const params = {
        headers: {
            'Host': __ENV.HEADERS_HOST || 'taskflow.local',
        },
    };
    http.get(url, params);
    sleep(1);
}