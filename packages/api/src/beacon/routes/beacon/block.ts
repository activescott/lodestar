/* eslint-disable @typescript-eslint/naming-convention */
import {ContainerType, ListCompositeType, ValueOf} from "@chainsafe/ssz";
import {ChainForkConfig} from "@lodestar/config";
import {
  allForks,
  Slot,
  ssz,
  RootHex,
  deneb,
  phase0,
  isSignedBlockContents,
  isSignedBlindedBlockContents,
} from "@lodestar/types";
import {ForkName, ForkSeq} from "@lodestar/params";
import {Endpoint, RequestCodec, RouteDefinitions, Schema} from "../../../utils/index.js";
import {
  EmptyMeta,
  EmptyMetaCodec,
  EmptyResponseData,
  EmptyResponseDataCodec,
  ExecutionOptimisticAndVersionCodec,
  ExecutionOptimisticAndVersionMeta,
  ExecutionOptimisticCodec,
  ExecutionOptimisticMeta,
  WithVersion,
} from "../../../utils/codecs.js";

// See /packages/api/src/routes/index.ts for reasoning and instructions to add new routes

// ssz types

export const BlockHeaderResponseType = new ContainerType({
  root: ssz.Root,
  canonical: ssz.Boolean,
  header: ssz.phase0.SignedBeaconBlockHeader,
});
export const BlockHeadersResponseType = new ListCompositeType(BlockHeaderResponseType, 1000);
export const RootResponseType = new ContainerType({
  root: ssz.Root,
});
export const SignedBlockContentsType = new ContainerType({
  signedBlock: ssz.deneb.SignedBeaconBlock,
  signedBlobSidecars: ssz.deneb.SignedBlobSidecars,
});
export const SignedBlindedBlockContentsType = new ContainerType({
  signedBlindedBlock: ssz.deneb.SignedBlindedBeaconBlock,
  signedBlindedBlobSidecars: ssz.deneb.SignedBlindedBlobSidecars,
});

export type BlockHeaderResponse = ValueOf<typeof BlockHeaderResponseType>;
export type BlockHeadersResponse = ValueOf<typeof BlockHeadersResponseType>;
export type RootResponse = ValueOf<typeof RootResponseType>;
export type SignedBlockContents = ValueOf<typeof SignedBlockContentsType>;
export type SignedBlindedBlockContents = ValueOf<typeof SignedBlindedBlockContentsType>;

export type BlockId = RootHex | Slot | "head" | "genesis" | "finalized";

/**
 * True if the response references an unverified execution payload. Optimistic information may be invalidated at
 * a later time. If the field is not present, assume the False value.
 */
export type ExecutionOptimistic = boolean;

export enum BroadcastValidation {
  gossip = "gossip",
  consensus = "consensus",
  consensusAndEquivocation = "consensus_and_equivocation",
}

export type Endpoints = {
  /**
   * Get block
   * Returns the complete `SignedBeaconBlock` for a given block ID.
   *
   * param blockId Block identifier.
   * Can be one of: "head" (canonical head in node's view), "genesis", "finalized", \<slot\>, \<hex encoded blockRoot with 0x prefix\>.
   */
  getBlock: Endpoint<
    //
    "GET",
    {blockId: BlockId},
    {params: {block_id: string}},
    phase0.SignedBeaconBlock,
    EmptyMeta
  >;

  /**
   * Get block
   * Retrieves block details for given block id.
   *
   * param blockId Block identifier.
   * Can be one of: "head" (canonical head in node's view), "genesis", "finalized", \<slot\>, \<hex encoded blockRoot with 0x prefix\>.
   */
  getBlockV2: Endpoint<
    "GET",
    {blockId: BlockId},
    {params: {block_id: string}},
    allForks.SignedBeaconBlock,
    ExecutionOptimisticAndVersionMeta
  >;

  /**
   * Get block attestations
   * Retrieves attestation included in requested block.
   *
   * param blockId Block identifier.
   * Can be one of: "head" (canonical head in node's view), "genesis", "finalized", \<slot\>, \<hex encoded blockRoot with 0x prefix\>.
   */
  getBlockAttestations: Endpoint<
    "GET",
    {blockId: BlockId},
    {params: {block_id: string}},
    allForks.BeaconBlockBody["attestations"],
    ExecutionOptimisticMeta
  >;

  /**
   * Get block header
   * Retrieves block header for given block id.
   *
   * param blockId Block identifier.
   * Can be one of: "head" (canonical head in node's view), "genesis", "finalized", \<slot\>, \<hex encoded blockRoot with 0x prefix\>.
   */
  getBlockHeader: Endpoint<
    "GET",
    {blockId: BlockId},
    {params: {block_id: string}},
    BlockHeaderResponse,
    ExecutionOptimisticMeta
  >;

  /**
   * Get block headers
   * Retrieves block headers matching given query. By default it will fetch current head slot blocks.
   */
  getBlockHeaders: Endpoint<
    "GET",
    {slot?: Slot; parentRoot?: string},
    {query: {slot?: number; parent_root?: string}},
    BlockHeaderResponse[],
    ExecutionOptimisticMeta
  >;

  /**
   * Get block root
   * Retrieves hashTreeRoot of BeaconBlock/BeaconBlockHeader
   *
   * param blockId Block identifier.
   * Can be one of: "head" (canonical head in node's view), "genesis", "finalized", \<slot\>, \<hex encoded blockRoot with 0x prefix\>.
   */
  getBlockRoot: Endpoint<
    "GET",
    {blockId: BlockId},
    {params: {block_id: string}},
    RootResponse,
    ExecutionOptimisticMeta
  >;

  /**
   * Publish a signed block.
   * Instructs the beacon node to broadcast a newly signed beacon block to the beacon network,
   * to be included in the beacon chain. The beacon node is not required to validate the signed
   * `BeaconBlock`, and a successful response (20X) only indicates that the broadcast has been
   * successful. The beacon node is expected to integrate the new block into its state, and
   * therefore validate the block internally, however blocks which fail the validation are still
   * broadcast but a different status code is returned (202)
   *
   * param requestBody The `SignedBeaconBlock` object composed of `BeaconBlock` object (produced by beacon node) and validator signature.
   * returns The block was validated successfully and has been broadcast. It has also been integrated into the beacon node's database.
   */
  publishBlock: Endpoint<
    //
    "POST",
    {signedBlockOrContents: allForks.SignedBeaconBlockOrContents},
    {body: unknown; headers: {"Eth-Consensus-Version": ForkName}},
    EmptyResponseData,
    EmptyMeta
  >;

  publishBlockV2: Endpoint<
    "POST",
    {signedBlockOrContents: allForks.SignedBeaconBlockOrContents; broadcastValidation?: BroadcastValidation},
    {body: unknown; headers: {"Eth-Consensus-Version": ForkName}; query: {broadcast_validation?: string}},
    EmptyResponseData,
    EmptyMeta
  >;

  /**
   * Publish a signed blinded block by submitting it to the mev relay and patching in the block
   * transactions beacon node gets in response.
   */
  publishBlindedBlock: Endpoint<
    "POST",
    {signedBlindedBlockOrContents: allForks.SignedBlindedBeaconBlockOrContents},
    {body: unknown; headers: {"Eth-Consensus-Version": ForkName}},
    EmptyResponseData,
    EmptyMeta
  >;

  publishBlindedBlockV2: Endpoint<
    "POST",
    {
      signedBlindedBlockOrContents: allForks.SignedBlindedBeaconBlockOrContents;
      broadcastValidation?: BroadcastValidation;
    },
    {body: unknown; headers: {"Eth-Consensus-Version": ForkName}; query: {broadcast_validation?: string}},
    EmptyResponseData,
    EmptyMeta
  >;

  /**
   * Get block BlobSidecar
   * Retrieves BlobSidecar included in requested block.
   *
   * param blockId Block identifier.
   * Can be one of: "head" (canonical head in node's view), "genesis", "finalized", \<slot\>, \<hex encoded blockRoot with 0x prefix\>.
   */
  getBlobSidecars: Endpoint<
    "GET",
    {blockId: BlockId},
    {params: {block_id: string}},
    deneb.BlobSidecars,
    ExecutionOptimisticMeta
  >;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blockIdOnlyReq: RequestCodec<Endpoint<"GET", {blockId: BlockId}, {params: {block_id: string}}, any, any>> = {
  writeReq: (block_id) => ({params: {block_id: String(block_id)}}),
  parseReq: ({params}) => ({blockId: params.block_id}),
  schema: {params: {block_id: Schema.StringRequired}},
};

export function getDefinitions(config: ChainForkConfig): RouteDefinitions<Endpoints> {
  return {
    getBlock: {
      url: "/eth/v1/beacon/blocks/{block_id}",
      method: "GET",
      req: blockIdOnlyReq,
      resp: {
        data: ssz.phase0.SignedBeaconBlock,
        meta: EmptyMetaCodec,
      },
    },
    getBlockV2: {
      url: "/eth/v2/beacon/blocks/{block_id}",
      method: "GET",
      req: blockIdOnlyReq,
      resp: {
        data: WithVersion((fork) => ssz[fork].SignedBeaconBlock),
        meta: ExecutionOptimisticAndVersionCodec,
      },
    },
    getBlockAttestations: {
      url: "/eth/v1/beacon/blocks/{block_id}/attestations",
      method: "GET",
      req: blockIdOnlyReq,
      resp: {
        data: ssz.phase0.BeaconBlockBody.fields.attestations,
        meta: ExecutionOptimisticCodec,
      },
    },
    getBlockHeader: {
      url: "/eth/v1/beacon/headers/{block_id}",
      method: "GET",
      req: blockIdOnlyReq,
      resp: {
        data: BlockHeaderResponseType,
        meta: ExecutionOptimisticCodec,
      },
    },
    getBlockHeaders: {
      url: "/eth/v1/beacon/headers",
      method: "GET",
      req: {
        writeReq: ({slot, parentRoot}) => ({query: {slot, parent_root: parentRoot}}),
        parseReq: ({query}) => ({slot: query.slot, parentRoot: query.parent_root}),
        schema: {query: {slot: Schema.Uint, parent_root: Schema.String}},
      },
      resp: {
        data: BlockHeadersResponseType,
        meta: ExecutionOptimisticCodec,
      },
    },
    getBlockRoot: {
      url: "/eth/v1/beacon/blocks/{block_id}/root",
      method: "GET",
      req: blockIdOnlyReq,
      resp: {
        data: RootResponseType,
        meta: ExecutionOptimisticCodec,
      },
    },
    publishBlock: {
      url: "/eth/v1/beacon/blocks",
      method: "POST",
      req: {
        writeReqJson: ({signedBlockOrContents}) => {
          const slot = isSignedBlockContents(signedBlockOrContents)
            ? signedBlockOrContents.signedBlock.message.slot
            : signedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getForkTypes(slot)
                    .SignedBeaconBlock.toJson(signedBlockOrContents as allForks.SignedBeaconBlock)
                : SignedBlockContentsType.toJson(signedBlockOrContents as SignedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
          };
        },
        parseReqJson: ({body, headers}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          return {
            signedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName].SignedBeaconBlock.fromJson(body)
                : SignedBlockContentsType.fromJson(body),
          };
        },
        writeReqSsz: ({signedBlockOrContents}) => {
          const slot = isSignedBlockContents(signedBlockOrContents)
            ? signedBlockOrContents.signedBlock.message.slot
            : signedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getForkTypes(slot)
                    .SignedBeaconBlock.serialize(signedBlockOrContents as allForks.SignedBeaconBlock)
                : SignedBlockContentsType.serialize(signedBlockOrContents as SignedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
          };
        },
        parseReqSsz: ({body, headers}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          return {
            signedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName].SignedBeaconBlock.deserialize(body)
                : SignedBlockContentsType.deserialize(body),
          };
        },
        schema: {
          body: Schema.Object,
        },
      },
      resp: {
        data: EmptyResponseDataCodec,
        meta: EmptyMetaCodec,
      },
    },
    publishBlockV2: {
      url: "/eth/v2/beacon/blocks",
      method: "POST",
      req: {
        writeReqJson: ({signedBlockOrContents, broadcastValidation}) => {
          const slot = isSignedBlockContents(signedBlockOrContents)
            ? signedBlockOrContents.signedBlock.message.slot
            : signedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getForkTypes(slot)
                    .SignedBeaconBlock.toJson(signedBlockOrContents as allForks.SignedBeaconBlock)
                : SignedBlockContentsType.toJson(signedBlockOrContents as SignedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
            query: {broadcast_validation: broadcastValidation},
          };
        },
        parseReqJson: ({body, headers, query}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          return {
            signedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName].SignedBeaconBlock.fromJson(body)
                : SignedBlockContentsType.fromJson(body),
            broadcastValidation: query.broadcast_validation as BroadcastValidation,
          };
        },
        writeReqSsz: ({signedBlockOrContents, broadcastValidation}) => {
          const slot = isSignedBlockContents(signedBlockOrContents)
            ? signedBlockOrContents.signedBlock.message.slot
            : signedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getForkTypes(slot)
                    .SignedBeaconBlock.serialize(signedBlockOrContents as allForks.SignedBeaconBlock)
                : SignedBlockContentsType.serialize(signedBlockOrContents as SignedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
            query: {broadcast_validation: broadcastValidation},
          };
        },
        parseReqSsz: ({body, headers, query}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          return {
            signedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName].SignedBeaconBlock.deserialize(body)
                : SignedBlockContentsType.deserialize(body),
            broadcastValidation: query.broadcast_validation as BroadcastValidation,
          };
        },
        schema: {
          body: Schema.Object,
          query: {broadcast_validation: Schema.String},
        },
      },
      resp: {
        data: EmptyResponseDataCodec,
        meta: EmptyMetaCodec,
      },
    },
    publishBlindedBlock: {
      url: "/eth/v1/beacon/blinded_blocks",
      method: "POST",
      req: {
        writeReqJson: ({signedBlindedBlockOrContents}) => {
          const slot = isSignedBlindedBlockContents(signedBlindedBlockOrContents)
            ? signedBlindedBlockOrContents.signedBlindedBlock.message.slot
            : signedBlindedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getBlindedForkTypes(slot)
                    .SignedBeaconBlock.toJson(signedBlindedBlockOrContents as allForks.SignedBlindedBeaconBlock)
                : SignedBlindedBlockContentsType.toJson(signedBlindedBlockOrContents as SignedBlindedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
          };
        },
        parseReqJson: ({body, headers}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          if (forkSeq < ForkSeq.capella) throw new Error("TODO"); // TODO
          return {
            signedBlindedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName as "capella"].SignedBlindedBeaconBlock.fromJson(body)
                : SignedBlindedBlockContentsType.fromJson(body),
          };
        },
        writeReqSsz: ({signedBlindedBlockOrContents}) => {
          const slot = isSignedBlindedBlockContents(signedBlindedBlockOrContents)
            ? signedBlindedBlockOrContents.signedBlindedBlock.message.slot
            : signedBlindedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getBlindedForkTypes(slot)
                    .SignedBeaconBlock.serialize(signedBlindedBlockOrContents as allForks.SignedBlindedBeaconBlock)
                : SignedBlindedBlockContentsType.serialize(signedBlindedBlockOrContents as SignedBlindedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
          };
        },
        parseReqSsz: ({body, headers}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          if (forkSeq < ForkSeq.capella) throw new Error("TODO"); // TODO
          return {
            signedBlindedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName as "capella"].SignedBlindedBeaconBlock.deserialize(body)
                : SignedBlindedBlockContentsType.deserialize(body),
          };
        },
        schema: {
          body: Schema.Object,
        },
      },
      resp: {
        data: EmptyResponseDataCodec,
        meta: EmptyMetaCodec,
      },
    },
    publishBlindedBlockV2: {
      url: "/eth/v2/beacon/blinded_blocks",
      method: "POST",
      req: {
        writeReqJson: ({signedBlindedBlockOrContents, broadcastValidation}) => {
          const slot = isSignedBlindedBlockContents(signedBlindedBlockOrContents)
            ? signedBlindedBlockOrContents.signedBlindedBlock.message.slot
            : signedBlindedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getBlindedForkTypes(slot)
                    .SignedBeaconBlock.toJson(signedBlindedBlockOrContents as allForks.SignedBlindedBeaconBlock)
                : SignedBlindedBlockContentsType.toJson(signedBlindedBlockOrContents as SignedBlindedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
            query: {broadcast_validation: broadcastValidation},
          };
        },
        parseReqJson: ({body, headers, query}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          if (forkSeq < ForkSeq.capella) throw new Error("TODO"); // TODO
          return {
            signedBlindedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName as "capella"].SignedBlindedBeaconBlock.fromJson(body)
                : SignedBlindedBlockContentsType.fromJson(body),
            broadcastValidation: query.broadcast_validation as BroadcastValidation,
          };
        },
        writeReqSsz: ({signedBlindedBlockOrContents, broadcastValidation}) => {
          const slot = isSignedBlindedBlockContents(signedBlindedBlockOrContents)
            ? signedBlindedBlockOrContents.signedBlindedBlock.message.slot
            : signedBlindedBlockOrContents.message.slot;
          return {
            body:
              config.getForkSeq(slot) < ForkSeq.deneb
                ? config
                    .getBlindedForkTypes(slot)
                    .SignedBeaconBlock.serialize(signedBlindedBlockOrContents as allForks.SignedBlindedBeaconBlock)
                : SignedBlindedBlockContentsType.serialize(signedBlindedBlockOrContents as SignedBlindedBlockContents),
            headers: {
              "Eth-Consensus-Version": config.getForkName(slot),
            },
            query: {broadcast_validation: broadcastValidation},
          };
        },
        parseReqSsz: ({body, headers, query}) => {
          const forkName = headers["Eth-Consensus-Version"]; // TODO validation
          const forkSeq = config.forks[forkName].seq;
          if (forkSeq < ForkSeq.capella) throw new Error("TODO"); // TODO
          return {
            signedBlindedBlockOrContents:
              forkSeq < ForkSeq.deneb
                ? ssz[forkName as "capella"].SignedBlindedBeaconBlock.deserialize(body)
                : SignedBlindedBlockContentsType.deserialize(body),
            broadcastValidation: query.broadcast_validation as BroadcastValidation,
          };
        },
        schema: {
          body: Schema.Object,
        },
      },
      resp: {
        data: EmptyResponseDataCodec,
        meta: EmptyMetaCodec,
      },
    },
    getBlobSidecars: {
      url: "/eth/v1/beacon/blob_sidecars/{block_id}",
      method: "GET",
      req: blockIdOnlyReq,
      resp: {
        data: ssz.deneb.BlobSidecars,
        meta: ExecutionOptimisticCodec,
      },
    },
  };
}
