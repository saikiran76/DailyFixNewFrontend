export const config = {
  apiUrl: import.meta.env.VITE_API_URL,
  matrixHomeserverUrl: import.meta.env.VITE_MATRIX_HOMESERVER_URL || 'https://matrix-client.matrix.org',
  socketUrl: import.meta.env.VITE_SOCKET_URL
}; 