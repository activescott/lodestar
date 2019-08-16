/**
 * @module api/rpc
 */

import {IHttpServerOpts, IWsServerOpts, TransportType} from "./transport";
import {ApiNamespace} from "../index";
import {IConfigurationModule} from "../../util/config";
import {processApiNamespaces} from "../utils";

export interface IRpcOptions {
  ws: IWsServerOpts;
  http: IHttpServerOpts;
  transports: TransportType[];
  api: ApiNamespace[];
}

export default {
  transports: [],
  api: [ApiNamespace.BEACON, ApiNamespace.VALIDATOR],
  http: {
    host: "127.0.0.1",
    port: 9546,
    cors: "*"
  },
  ws: {
    host: "127.0.0.1",
    port: 9547,
  },
};

export const RpcOptions: IConfigurationModule = {
  name: "rest",
  description: "Chain specific configurations",
  fields: [
    {
      name: 'enabled',
      type: "boolean",
      configurable: true,
      cli: {
        flag: "--rpc"
      }
    },
    {
      name: 'api',
      type: "string",
      process: processApiNamespaces,
      configurable: true,
      cli: {
        flag: "--rpc-api"
      }
    },
    {
      name: 'host',
      type: "string",
      configurable: true,
      cli: {
        flag: "--rpc-host"
      }
    },
    {
      name: 'port',
      type: "number",
      configurable: true,
      cli: {
        flag: "--rpc-port"
      }
    },
    {
      name: 'cors',
      type: "string",
      configurable: true,
      cli: {
        flag: "--rpc-rest-cors"
      }
    }
  ]
};