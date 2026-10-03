// The compiled stdio server must work with every outbound network path disabled.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
const denied = () => { throw new Error('The local MCP server attempted network access.'); };
globalThis.fetch = denied;
http.request = http.get = https.request = https.get = denied;
net.Socket.prototype.connect = denied;
dns.lookup = dns.resolve = denied;
