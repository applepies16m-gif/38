// Settings that differ between ways of running the app. Every
// service reads the server's address from here, so it is written
// in one place and not repeated in each service.
//
// This file is the normal one (ng serve, ng build). The end-to-end
// tests swap in environment.e2e.ts, which points at a separate
// test server so they never touch real data. The swap is set up in
// angular.json under the "e2e" configuration.
export const environment = {
  serverUrl: 'http://localhost:3000'
};
