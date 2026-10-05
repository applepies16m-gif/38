// Used only by the end-to-end tests (ng serve --configuration e2e).
// It points the app at the test server on port 3100, which uses
// its own database, so the tests never touch real data.
export const environment = {
  serverUrl: 'http://localhost:3100',
};
