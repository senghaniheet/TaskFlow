import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 500,          // virtual users
    duration: '2m',   // test duration
};

export default function () {
    http.get('http://taskflow.local/api/workspaces');
    sleep(1);
}