import varint from "varint";
import {routes} from "@lodestar/api";
import {fromHexString} from "@chainsafe/ssz";
import {SyncPeriod} from "@lodestar/types";
import {MAX_REQUEST_LIGHT_CLIENT_COMMITTEE_HASHES, MAX_REQUEST_LIGHT_CLIENT_UPDATES} from "@lodestar/params";
import {LightClientUpdate} from "@lodestar/types/altair";
import {ssz} from "@lodestar/types";
import {ApiModules} from "../types.js";
import {IApiOptions} from "../../options.js";

// TODO: Import from lightclient/server package

export function getLightclientApi(
  opts: IApiOptions,
  {chain, config}: Pick<ApiModules, "chain" | "config" | "db">
): routes.lightclient.Api {
  const serializeLightClientUpdates = (chunks: LightClientUpdate[]): Uint8Array => {
    // https://github.com/ethereum/beacon-APIs/blob/master/apis/beacon/light_client/updates.yaml#L39
    /**
     * Sequence of zero or more `response_chunk`. Each _successful_ `response_chunk` MUST contain a single `LightClientUpdate` payload:
     * ```
     * (
     *   response_chunk_len: Little-endian Uint64 byte length of `response_chunk`
     *   response_chunk: (
     *     context: 4 byte `ForkDigest`
     *     payload: SSZ serialized payload bytes
     *   )
     * )
     */
    const result: Uint8Array[] = [];
    for (const lightClientUpdate of chunks) {
      const payload = ssz.altair.LightClientUpdate.serialize(lightClientUpdate);
      const forkDigest = config.forkName2ForkDigest(config.getForkName(lightClientUpdate.attestedHeader.slot));
      const responseChunk = new Uint8Array([...forkDigest, ...payload]);
      // length portion should be u64bit long according to specification
      const length = new Uint8Array(8);
      length.set(Uint8Array.from(varint.encode(responseChunk.length)), 0);
      result.push(new Uint8Array([...length, ...responseChunk]));
    }
    return result.reduce((acc, curr) => new Uint8Array([...acc, ...curr]));
  };

  return {
    async getUpdates(startPeriod: SyncPeriod, count: number, format?: routes.debug.StateFormat) {
      const maxAllowedCount = Math.min(MAX_REQUEST_LIGHT_CLIENT_UPDATES, count);
      const periods = Array.from({length: maxAllowedCount}, (_ignored, i) => i + startPeriod);
      const updates = await Promise.all(periods.map((period) => chain.lightClientServer.getUpdate(period)));
      if (format === "ssz") {
        // Casting to any otherwise Typescript doesn't like the multi-type return
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        return serializeLightClientUpdates(updates) as any;
      } else {
        return {data: updates};
      }
    },

    async getOptimisticUpdate(format?: routes.debug.StateFormat) {
      const data = chain.lightClientServer.getOptimisticUpdate();
      if (data === null) {
        throw Error("No optimistic update available");
      } else if (format === "ssz") {
        // Casting to any otherwise Typescript doesn't like the multi-type return
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        return ssz.altair.LightClientOptimisticUpdate.serialize(data) as any;
      } else {
        return {data};
      }
    },

    async getFinalityUpdate(format?: routes.debug.StateFormat) {
      const data = chain.lightClientServer.getFinalityUpdate();
      if (data === null) {
        throw Error("No finality update available");
      } else if (format === "ssz") {
        // Casting to any otherwise Typescript doesn't like the multi-type return
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        return ssz.altair.LightClientFinalityUpdate.serialize(data) as any;
      } else {
        return {data};
      }
    },

    async getBootstrap(blockRoot, format?: routes.debug.StateFormat) {
      const bootstrapProof = await chain.lightClientServer.getBootstrap(fromHexString(blockRoot));
      if (format === "ssz") {
        // Casting to any otherwise Typescript doesn't like the multi-type return
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        return ssz.altair.LightClientBootstrap.serialize(bootstrapProof) as any;
      } else {
        return {data: bootstrapProof};
      }
    },

    async getCommitteeRoot(startPeriod: SyncPeriod, count: number) {
      const maxAllowedCount = Math.min(MAX_REQUEST_LIGHT_CLIENT_COMMITTEE_HASHES, count);
      const periods = Array.from({length: maxAllowedCount}, (_ignored, i) => i + startPeriod);
      const committeeHashes = await Promise.all(
        periods.map((period) => chain.lightClientServer.getCommitteeRoot(period))
      );
      return {data: committeeHashes};
    },
  };
}
