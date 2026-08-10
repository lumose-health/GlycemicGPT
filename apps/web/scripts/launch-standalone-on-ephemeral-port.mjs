import { Server } from "node:net";
import { pathToFileURL } from "node:url";

const standaloneServer = process.argv[2];
if (!standaloneServer) {
  throw new Error("The standalone server path is required.");
}

const originalListen = Server.prototype.listen;
let intercepted = false;

Server.prototype.listen = function listen(...args) {
  if (!intercepted && typeof args[0] === "number") {
    intercepted = true;
    args[0] = 0;
    Server.prototype.listen = originalListen;
    this.once("listening", () => {
      const address = this.address();
      if (address && typeof address !== "string") {
        process.send?.({ port: address.port });
      }
    });
  }

  return originalListen.apply(this, args);
};

await import(pathToFileURL(standaloneServer).href);
