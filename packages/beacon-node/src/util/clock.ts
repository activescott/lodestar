import EventEmitter from "node:events";
import type StrictEventEmitter from "strict-event-emitter-types";
import type {Epoch, Slot} from "@lodestar/types";
import {ChainForkConfig} from "@lodestar/config";
import {ErrorAborted} from "@lodestar/utils";
import {computeEpochAtSlot, computeTimeAtSlot, getCurrentSlot} from "@lodestar/state-transition";
import {MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS} from "../constants/constants.js";

export enum ClockEvent {
  /**
   * This event signals the start of a new slot, and that subsequent calls to `clock.currentSlot` will equal `slot`.
   * This event is guaranteed to be emitted every `SECONDS_PER_SLOT` seconds.
   */
  slot = "clock:slot",
  /**
   * This event signals the start of a new epoch, and that subsequent calls to `clock.currentEpoch` will return `epoch`.
   * This event is guaranteed to be emitted every `SECONDS_PER_SLOT * SLOTS_PER_EPOCH` seconds.
   */
  epoch = "clock:epoch",
}

export type ClockEvents = {
  [ClockEvent.slot]: (slot: Slot) => void;
  [ClockEvent.epoch]: (epoch: Epoch) => void;
};

/**
 * Tracks the current chain time, measured in `Slot`s and `Epoch`s
 *
 * The time is dependent on:
 * - `state.genesisTime` - the genesis time
 * - `SECONDS_PER_SLOT` - # of seconds per slot
 * - `SLOTS_PER_EPOCH` - # of slots per epoch
 */
export type IClock = StrictEventEmitter<EventEmitter, ClockEvents> & {
  readonly genesisTime: Slot;
  readonly currentSlot: Slot;
  /**
   * If it's too close to next slot, maxCurrentSlot = currentSlot + 1
   */
  readonly currentSlotWithGossipDisparity: Slot;
  readonly currentEpoch: Epoch;
  /**
   * Return the current slot with future tolerance e.g. currentSlot or currentSlot + 1
   * -----------------------------------------------------------------------------------
   * |             |    (current)    |                            |
   *              |                  |<-futureToleranceMs->|
   */
  slotWithFutureTolerance(toleranceMs: number): Slot;
  /**
   * Return the current slot with past tolerance. e.g. currentSlot or currentSlot - 1
   * -----------------------------------------------------------------------------------
   * |                                 |    (current)    |                            |
   *              |<-pastToleranceMs->|                 |
   */
  slotWithPastTolerance(toleranceSec: number): Slot;
  /**
   * Check if a slot is current slot given MAXIMUM_GOSSIP_CLOCK_DISPARITY.
   */
  isCurrentSlotGivenGossipDisparity(slot: Slot): boolean;
  /**
   * Check if current slot is same as given slot considering futureDisparityMs.
   * -----------------------------------------------------------------------------------
   * |                                 |    (current)    |                            |
   *              |<-pastToleranceMs->|                 |<-futureToleranceMs->|
   */
  isCurrentSlotGivenTolerance(slot: Slot, pastToleranceMs: number, futureToleranceMs: number): boolean;
  /**
   * Returns a promise that waits until at least `slot` is reached
   * Resolves when the current slot >= `slot`
   * Rejects if the clock is aborted
   */
  waitForSlot(slot: Slot): Promise<void>;
  /**
   * Return second from a slot to either toSec or now.
   */
  secFromSlot(slot: Slot, toSec?: number): number;
};

function getSlotAtTime(timeInMs: number, genesisTimeInMs: number, msPerSlot: number): Slot {
  return Math.floor((timeInMs - genesisTimeInMs) / msPerSlot);
}

/**
 * A local clock, the clock time is assumed to be trusted
 */
export class Clock extends EventEmitter implements IClock {
  readonly genesisTime: number;
  private readonly config: ChainForkConfig;
  private timeoutId: number | NodeJS.Timeout;
  private readonly signal: AbortSignal;
  private _currentSlot: number;
  private _genesisTimeMs: number;
  private _msPerSlot: number;

  constructor({config, genesisTime, signal}: {config: ChainForkConfig; genesisTime: number; signal: AbortSignal}) {
    super();

    this.config = config;
    this.genesisTime = genesisTime;
    this.timeoutId = setTimeout(this.onNextSlot, this.msUntilNextSlot());
    this.signal = signal;
    this._currentSlot = getCurrentSlot(this.config, this.genesisTime);
    this._genesisTimeMs = this.genesisTime * 1000;
    this._msPerSlot = this.config.SECONDS_PER_SLOT * 1000;
    this.signal.addEventListener("abort", () => clearTimeout(this.timeoutId), {once: true});
  }

  get currentSlot(): Slot {
    const slot = getCurrentSlot(this.config, this.genesisTime);
    if (slot > this._currentSlot) {
      clearTimeout(this.timeoutId);
      this.onNextSlot(slot);
    }
    return slot;
  }

  /**
   * If it's too close to next slot given MAXIMUM_GOSSIP_CLOCK_DISPARITY, return currentSlot + 1.
   * Otherwise return currentSlot
   */
  get currentSlotWithGossipDisparity(): Slot {
    const currentSlot = this.currentSlot;
    const nextSlotTime = computeTimeAtSlot(this.config, currentSlot + 1, this.genesisTime) * 1000;
    return nextSlotTime - Date.now() < MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS ? currentSlot + 1 : currentSlot;
  }

  get currentEpoch(): Epoch {
    return computeEpochAtSlot(this.currentSlot);
  }

  /** Returns the slot if the internal clock were advanced by `toleranceMs`. */
  slotWithFutureTolerance(toleranceMs: number): Slot {
    return getSlotAtTime(Date.now(), this._genesisTimeMs + toleranceMs, this._msPerSlot);
  }

  /** Returns the slot if the internal clock were reversed by `toleranceMs`. */
  slotWithPastTolerance(toleranceMs: number): Slot {
    return getSlotAtTime(Date.now(), this._genesisTimeMs - toleranceMs, this._msPerSlot);
  }

  isCurrentSlotGivenTolerance(slot: Slot, pastToleranceMs: number, futureToleranceMs: number): boolean {
    const currentSlot = this.currentSlot;
    if (currentSlot === slot) {
      return true;
    }
    futureToleranceMs ??= pastToleranceMs;

    if (pastToleranceMs > 0 && this.slotWithPastTolerance(pastToleranceMs) === slot) return true;
    if (futureToleranceMs > 0 && this.slotWithFutureTolerance(futureToleranceMs) === slot) return true;

    return false;
  }

  /**
   * Check if a slot is current slot given MAXIMUM_GOSSIP_CLOCK_DISPARITY.
   */
  isCurrentSlotGivenGossipDisparity(slot: Slot): boolean {
    return this.isCurrentSlotGivenTolerance(slot, MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS, MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS);
  }

  async waitForSlot(slot: Slot): Promise<void> {
    if (this.signal.aborted) {
      throw new ErrorAborted();
    }

    if (slot <= 0) {
      return;
    }

    if (this.currentSlot >= slot) {
      return;
    }

    return new Promise((resolve, reject) => {
      const onSlot = (clockSlot: Slot): void => {
        if (clockSlot >= slot) {
          onDone();
        }
      };

      const onDone = (): void => {
        this.off(ClockEvent.slot, onSlot);
        this.signal.removeEventListener("abort", onAbort);
        resolve();
      };

      const onAbort = (): void => {
        this.off(ClockEvent.slot, onSlot);
        reject(new ErrorAborted());
      };

      this.on(ClockEvent.slot, onSlot);
      this.signal.addEventListener("abort", onAbort, {once: true});
    });
  }

  secFromSlot(slot: Slot, toSec = Date.now() / 1000): number {
    return toSec - (this.genesisTime + slot * this.config.SECONDS_PER_SLOT);
  }

  private onNextSlot = (slot?: Slot): void => {
    const clockSlot = slot ?? getCurrentSlot(this.config, this.genesisTime);
    // process multiple clock slots in the case the main thread has been saturated for > SECONDS_PER_SLOT
    while (this._currentSlot < clockSlot && !this.signal.aborted) {
      const previousSlot = this._currentSlot;
      this._currentSlot++;

      this.emit(ClockEvent.slot, this._currentSlot);

      const previousEpoch = computeEpochAtSlot(previousSlot);
      const currentEpoch = computeEpochAtSlot(this._currentSlot);

      if (previousEpoch < currentEpoch) {
        this.emit(ClockEvent.epoch, currentEpoch);
      }
    }

    if (!this.signal.aborted) {
      //recursively invoke onNextSlot
      this.timeoutId = setTimeout(this.onNextSlot, this.msUntilNextSlot());
    }
  };

  private msUntilNextSlot(): number {
    const milliSecondsPerSlot = this.config.SECONDS_PER_SLOT * 1000;
    const diffInMilliSeconds = Date.now() - this.genesisTime * 1000;
    return milliSecondsPerSlot - (diffInMilliSeconds % milliSecondsPerSlot);
  }
}
